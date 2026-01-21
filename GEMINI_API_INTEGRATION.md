# Gemini Vision API Integration Analysis

## Current Bottlenecks

### 1. **Landmark Detection**
- **Current**: iOS uses Vision Framework (`VNDetectFaceLandmarksRequest`) for 2D landmarks
- **Backend**: Uses MediaPipe landmark embeddings (pre-computed barycentric coordinates) to project landmarks onto FLAME mesh
- **Problem**: 
  - Vision Framework landmarks are 2D only, need projection to 3D
  - MediaPipe embeddings assume FLAME mesh is already fitted correctly
  - If initial fit is wrong, landmarks are wrong → circular dependency

### 2. **Shape Parameter Initialization**
- **Current**: Starts from `zeros` (mean/average face)
- **Problem**: 
  - Must optimize away from mean face
  - Regularization pulls back toward mean
  - Results look generic

### 3. **Pose Estimation**
- **Current**: Rigid ICP alignment + manual initialization
- **Problem**: Can get stuck in local minima if initial pose is wrong

## What We Can Send to Gemini Vision API

### Option 1: Multiple RGB Frames (RECOMMENDED - Best for Side Profile)
**Send**: 3-5 frames from multi-frame capture:
- 1-2 front-facing (yaw: -8° to +8°)
- 1-2 left profile (yaw: -25° to -10°)
- 1-2 right profile (yaw: +10° to +25°)

**Why Multiple Frames?**
- ✅ **Side profile visibility**: Nose shape, cheek depth, jawline are only visible from side
- ✅ **Better shape constraints**: Front view alone is underdetermined for 3D shape
- ✅ **Disentangles shape vs expression**: Same identity across frames, different poses
- ✅ **More robust**: Occlusions/lighting issues in one frame don't kill the fit
- ✅ **Matches FLAME training**: FLAME was trained on 4D sequences (same identity, multiple views)

**Get Back**:
```json
{
  "initial_shape_params": [0.2, -0.1, ...],  // 100-dim FLAME shape (shared across frames)
  "frame_estimates": [
    {
      "frame_id": 0,
      "yaw": 0.5,
      "landmarks_2d": [...],
      "landmarks_3d": [...],
      "expression": [0.0, ...],
      "pose": {"yaw": 0.5, "pitch": -2.1, "roll": 1.3}
    },
    {
      "frame_id": 1,
      "yaw": -18.2,
      "landmarks_2d": [...],
      "landmarks_3d": [...],
      "expression": [0.0, ...],
      "pose": {"yaw": -18.2, "pitch": -1.5, "roll": 0.8}
    }
  ],
  "quality_score": 0.87,
  "face_detected": true
}
```

**Benefits**:
- ✅ Captures full 3D structure (especially nose profile!)
- ✅ Better initial shape estimate
- ✅ More accurate landmarks from multiple angles
- ✅ Can use Gemini's multimodal understanding of 3D structure

**Cost/Latency**:
- Payload: ~600KB-1MB (3-5 JPEGs)
- API call: ~800-1200ms (Gemini can handle multiple images)
- Cost: ~$0.003-0.005 per scan (still very cheap)

### Option 2: Single RGB Frame (Fallback)
**Send**: One high-quality front-facing RGB frame

**Get Back**: Same structure as Option 1, but single frame

**Use Case**: Fallback if multi-frame capture fails or for faster processing

**Benefits**:
- ✅ Smaller payload (~200KB)
- ✅ Faster API call (~500ms)
- ✅ Lower cost (~$0.001-0.002)
- ❌ Missing side profile information

### Option 3: Rendered Point Cloud Image
**Send**: Rendered view of point cloud (front-facing, colored)

**Get Back**: Same as Option 1

**Drawbacks**:
- ❌ Need to render point cloud first (adds latency)
- ❌ May lose detail in rendering
- ❌ Still single view (missing side profile)

## Recommended Implementation

### Phase 1: Multi-Frame Initial Shape Estimation (Highest Impact)
**Goal**: Replace `shape_params = zeros()` with API-estimated shape from multiple views

**Implementation**:
1. **iOS**: Send 3-5 RGB frames alongside PLY (new multipart fields: `image_0`, `image_1`, etc.)
   - Select frames using existing `selectByYawBuckets` logic:
     - 2 front-facing (center bucket, yaw: -8° to +8°)
     - 1-2 left profile (yaw: -25° to -10°)
     - 1-2 right profile (yaw: +10° to +25°)
   - Include metadata: `yaw_0`, `yaw_1`, etc. as query params

2. **Backend**: Call Gemini Vision API with all frames:
   ```
   "Analyze these face images taken from different angles (front, left profile, right profile).
   Estimate FLAME 3DMM shape parameters that are consistent across all views.
   
   Return JSON with:
   - 'initial_shape_params': array of 100 floats (FLAME shape, shared across all frames)
   - 'frame_estimates': array of per-frame data:
     - 'yaw': float (degrees)
     - 'landmarks_2d': array of [x, y] (468 MediaPipe landmarks)
     - 'landmarks_3d': array of [x, y, z] if possible
     - 'expression': array of 50 floats (FLAME expression params)
     - 'pose': {yaw, pitch, roll} in degrees
   - 'quality_score': float 0-1
   
   The shape_params should represent the identity/shape that is consistent
   across all views, while expression and pose can vary per frame.
   Values should be in range [-3, 3] standard deviations."
   ```

3. Use returned `shape_params` to initialize FLAME fitting
4. Optionally use per-frame landmarks for multi-frame fitting (Phase 2)
5. Fallback to zeros if API fails

**Expected Impact**:
- 🎯 **Major**: Solves "generic face" problem
- 🎯 **Critical**: Captures nose profile and side features accurately
- 🎯 Reduces optimization iterations needed
- 🎯 Better fit quality, especially for surgical planning (nose accuracy!)

### Phase 2: Multi-Frame Landmark Fitting (Medium Impact)
**Goal**: Use landmarks from multiple views for better 3D fitting

**Implementation**:
1. Use per-frame landmarks from Phase 1 API response
2. Modify FLAME fitting to accept multiple landmark sets (one per frame)
3. Fit shape parameters shared across frames
4. Fit expression/pose per frame
5. Loss function sums landmark errors across all frames

**Expected Impact**:
- 🎯 More accurate landmark loss (multiple views constrain shape better)
- 🎯 Better nose/feature alignment (side profile landmarks crucial!)
- 🎯 Faster convergence
- 🎯 Breaks circular dependency (landmarks from API, not FLAME mesh)

### Phase 3: Pose Initialization (Lower Priority)
**Goal**: Better initial pose estimate

**Implementation**:
1. Get pose estimate from Gemini
2. Initialize `pose_params` and `rigid_R` from API response
3. Skip or reduce rigid ICP stage

**Expected Impact**:
- 🎯 Faster convergence
- 🎯 Less likely to get stuck in local minima

## API Call Structure

### Request Format (Multi-Frame)
```python
import google.generativeai as genai
from PIL import Image
import io

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-pro-vision')

# Read multiple RGB frames from multipart upload
images = []
for i in range(num_frames):
    image_bytes = uploaded_images[i].read()
    img = Image.open(io.BytesIO(image_bytes))
    images.append(img)

# Build prompt with frame metadata
prompt_parts = [
    f"Analyze these {len(images)} face images taken from different angles:",
]
for i, (img, yaw) in enumerate(zip(images, yaw_angles)):
    prompt_parts.append(f"Frame {i}: yaw={yaw:.1f}°")
    prompt_parts.append(img)

prompt_parts.extend([
    "Estimate FLAME 3DMM shape parameters consistent across all views.",
    "Return JSON with:",
    "1. initial_shape_params: array of 100 floats (shared shape)",
    "2. frame_estimates: array of per-frame data:",
    "   - yaw: float",
    "   - landmarks_2d: array of [x, y] (468 MediaPipe landmarks)",
    "   - landmarks_3d: array of [x, y, z] if possible",
    "   - expression: array of 50 floats",
    "   - pose: {yaw, pitch, roll}",
    "3. quality_score: float 0-1",
    "Return ONLY valid JSON, no markdown."
])

response = model.generate_content(prompt_parts)
```
```

### Response Parsing
```python
import json
import re

# Extract JSON from response
json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
if json_match:
    data = json.loads(json_match.group())
    shape_params = data.get('initial_shape_params', [0.0] * 100)
    landmarks_3d = data.get('landmarks_3d', [])
    pose = data.get('pose_estimate', {})
```

## Cost/Benefit Analysis

### Costs (Multi-Frame)
- **API Cost**: ~$0.003-0.005 per scan (3-5 frames)
- **Latency**: +800-1200ms per scan (Gemini handles multiple images efficiently)
- **Payload**: ~600KB-1MB upload (still reasonable)
- **Dependency**: External API (needs fallback)

### Benefits (Multi-Frame)
- **Accuracy**: Significantly better initial fit, especially side profile
- **Nose Accuracy**: Critical for surgical planning - side profile captures nose shape
- **Speed**: Fewer optimization iterations needed
- **Quality**: Less generic-looking results, captures full 3D structure
- **Robustness**: Multiple views reduce impact of occlusions/lighting issues

### Fallback Strategy
1. Try Gemini API call (with 2s timeout)
2. If fails/timeout: use current zero initialization
3. Log API failures for monitoring

## Implementation Steps

1. **Add multi-frame image upload to iOS** (`uploadPLY` function)
   - Modify `collectMultiFramePLY` to also capture RGB frames
   - Store `CVPixelBuffer` for each selected frame candidate
   - Convert to JPEG and include as multipart fields: `image_0`, `image_1`, etc.
   - Include metadata: `yaw_0`, `yaw_1`, etc. as query params
   - Compress each JPEG (~200KB max, 3-5 frames = ~600KB-1MB total)

2. **Create Gemini service module** (`backend/gemini_service.py`)
   - Function: `estimate_flame_params(image_bytes) -> dict`
   - Error handling + fallback
   - Caching (optional)

3. **Integrate into FLAME fitting** (`flame_fit.py`)
   - Accept optional `initial_shape_params` argument
   - Use API shape if provided, else zeros

4. **Update main.py**
   - Extract image from multipart upload
   - Call Gemini service
   - Pass results to `fit_flame_mesh`

5. **Testing**
   - Test with/without API
   - Measure quality improvement
   - Monitor API costs

## Alternative: Start with Single Frame, Then Scale Up

If multi-frame is too complex initially, start simpler:

**Phase 1a: Single Frame Shape Estimation**
- Send 1 front-facing RGB frame → Get initial shape params
- Still solves "generic face" problem
- Lower cost/latency for testing

**Phase 1b: Add Side Profiles**
- Once single frame works, add 1-2 side profile frames
- Gets nose profile accuracy
- Incremental complexity

**Phase 1c: Full Multi-Frame**
- All 3-5 frames for maximum accuracy
- Best for surgical planning use case

## Next Steps

1. ✅ Research Gemini Vision API capabilities
2. ⏳ Test API with sample face images
3. ⏳ Implement Phase 1 (initial shape estimation)
4. ⏳ Measure improvement
5. ⏳ Add Phase 2 (landmarks) if needed
