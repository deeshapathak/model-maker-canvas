# Guided 5-Pose Capture Implementation

## User Flow

### Step-by-Step Guided Capture

1. **Front (Neutral)**
   - Instruction: "Face forward, look straight ahead"
   - Visual: Face frame overlay centered
   - Validation: Yaw: -5° to +5°, Roll: -5° to +5°, Pitch: -5° to +5°

2. **Left Profile**
   - Instruction: "Turn your head slowly to the left ~90°"
   - Visual: Arrow pointing left, side profile silhouette
   - Validation: Yaw: -75° to -105°, Roll: -10° to +10°

3. **Right Profile**
   - Instruction: "Turn your head slowly to the right ~90°"
   - Visual: Arrow pointing right, side profile silhouette
   - Validation: Yaw: +75° to +105°, Roll: -10° to +10°

4. **Looking Down**
   - Instruction: "Look down ~30°, keep head straight"
   - Visual: Arrow pointing down
   - Validation: Pitch: -20° to -40°, Yaw: -10° to +10°

5. **Looking Up**
   - Instruction: "Look up ~30°, keep head straight"
   - Visual: Arrow pointing up
   - Validation: Pitch: +20° to +40°, Yaw: -10° to +10°

## UI Design

### Capture State Machine

```
[Idle] → [Pose 1: Front] → [Validating] → [Pose 2: Left] → ...
  ↓                                                              ↓
[Error] ← [Invalid Pose] ← [Validating] ← [Pose 5: Up] ← [Pose 4: Down]
```

### Visual Elements

1. **Pose Indicator**
   - Large icon/emoji showing target pose
   - "1 of 5" progress indicator
   - Pose name: "Front", "Left Profile", etc.

2. **Face Frame Overlay**
   - Green when pose is correct
   - Yellow when adjusting
   - Red when invalid

3. **Pose Validation Feedback**
   - Real-time angle display: "Yaw: 2° ✓"
   - "Hold steady..." when valid
   - "Turn left more..." when invalid

4. **Capture Button**
   - "Capture Front" → "Capture Left" → etc.
   - Disabled until pose is valid
   - Auto-capture option (capture when valid for 1s)

## iOS Implementation

### Data Structures

```swift
enum CapturePose: Int, CaseIterable {
    case front = 0
    case left = 1
    case right = 2
    case down = 3
    case up = 4
    
    var name: String {
        switch self {
        case .front: return "Front"
        case .left: return "Left Profile"
        case .right: return "Right Profile"
        case .down: return "Looking Down"
        case .up: return "Looking Up"
        }
    }
    
    var instruction: String {
        switch self {
        case .front: return "Face forward, look straight ahead"
        case .left: return "Turn your head slowly to the left ~90°"
        case .right: return "Turn your head slowly to the right ~90°"
        case .down: return "Look down ~30°, keep head straight"
        case .up: return "Look up ~30°, keep head straight"
        }
    }
    
    var targetYaw: ClosedRange<Float> {
        switch self {
        case .front: return -5...5
        case .left: return -105...(-75)
        case .right: return 75...105
        case .down: return -10...10
        case .up: return -10...10
        }
    }
    
    var targetPitch: ClosedRange<Float> {
        switch self {
        case .front: return -5...5
        case .left: return -10...10
        case .right: return -10...10
        case .down: return -40...(-20)
        case .up: return 20...40
        }
    }
    
    var targetRoll: ClosedRange<Float> {
        switch self {
        case .front: return -5...5
        case .left: return -10...10
        case .right: return -10...10
        case .down: return -10...10
        case .up: return -10...10
        }
    }
}

struct CapturedFrame {
    let pose: CapturePose
    let rgbImage: CVPixelBuffer
    let depthData: AVDepthData
    let timestamp: Date
    let yaw: Float?
    let pitch: Float?
    let roll: Float?
    let landmarks: [CGPoint]
}
```

### Capture Flow

```swift
class GuidedCaptureSession {
    private var currentPose: CapturePose = .front
    private var capturedFrames: [CapturedFrame] = []
    private var poseValidationTimer: Timer?
    private var validPoseDuration: TimeInterval = 0
    
    func startGuidedCapture() {
        currentPose = .front
        capturedFrames = []
        updateUIForPose(currentPose)
    }
    
    func captureCurrentPose() {
        guard let frame = captureFrame() else { return }
        guard isValidPose(frame: frame, pose: currentPose) else {
            showError("Pose not valid. Please adjust.")
            return
        }
        
        capturedFrames.append(frame)
        
        if currentPose == .up {
            // All poses captured
            completeCapture()
        } else {
            // Move to next pose
            currentPose = CapturePose(rawValue: currentPose.rawValue + 1)!
            updateUIForPose(currentPose)
        }
    }
    
    func isValidPose(frame: CapturedFrame, pose: CapturePose) -> Bool {
        guard let yaw = frame.yaw,
              let pitch = frame.pitch,
              let roll = frame.roll else {
            return false
        }
        
        return pose.targetYaw.contains(yaw) &&
               pose.targetPitch.contains(pitch) &&
               pose.targetRoll.contains(roll)
    }
}
```

## Backend Integration

### API Endpoint Update

**Current**: `POST /api/scans` with single PLY

**New**: `POST /api/scans` with:
- `ply`: PLY file (point cloud from all frames)
- `image_front`: JPEG (Front pose)
- `image_left`: JPEG (Left profile)
- `image_right`: JPEG (Right profile)
- `image_down`: JPEG (Looking down)
- `image_up`: JPEG (Looking up)
- `metadata`: JSON with pose angles, timestamps

### Gemini API Integration

**Prompt for 5-Frame Analysis**:

```
You are analyzing 5 face images captured from specific angles for 3D face reconstruction:

1. Front: Face forward, neutral expression
2. Left Profile: Head turned ~90° left
3. Right Profile: Head turned ~90° right  
4. Looking Down: Head tilted down ~30°
5. Looking Up: Head tilted up ~30°

Tasks:
1. Detect and normalize landmarks (468 MediaPipe format) for each frame
2. Estimate FLAME 3DMM shape parameters (100-dim) that are consistent across all views
3. Estimate per-frame expression (50-dim) and pose (yaw, pitch, roll)
4. Validate data quality and standardize coordinate systems
5. Return normalized, ready-to-use data for FLAME fitting

Return JSON:
{
  "initial_shape_params": [100 floats],
  "frame_estimates": [
    {
      "pose_name": "front",
      "landmarks_2d": [[x, y], ...],
      "landmarks_3d": [[x, y, z], ...],
      "expression": [50 floats],
      "pose": {"yaw": float, "pitch": float, "roll": float},
      "quality_score": float
    },
    ... (5 frames)
  ],
  "normalization_applied": {
    "coordinate_system": "FLAME_standard",
    "scale_factor": float,
    "centroid_offset": [x, y, z]
  },
  "validation": {
    "all_frames_valid": bool,
    "warnings": [string],
    "overall_quality": float
  }
}
```

## Implementation Steps

### Phase 1: iOS Guided Capture UI
1. ✅ Create `CapturePose` enum
2. ⏳ Update guidance overlay for pose-specific instructions
3. ⏳ Add pose validation logic
4. ⏳ Implement step-by-step capture flow
5. ⏳ Add visual feedback (arrows, icons, color coding)

### Phase 2: Multi-Frame Storage
1. ⏳ Store RGB frames for each pose
2. ⏳ Convert to JPEG with compression
3. ⏳ Include pose metadata (angles, timestamps)

### Phase 3: Backend Multi-Frame Handling
1. ⏳ Update `/api/scans` endpoint to accept 5 images
2. ⏳ Extract and validate images
3. ⏳ Store frames with scan ID

### Phase 4: Gemini Integration
1. ⏳ Create `backend/gemini_service.py`
2. ⏳ Implement 5-frame analysis function
3. ⏳ Parse and validate Gemini response
4. ⏳ Fallback to zero initialization if API fails

### Phase 5: FLAME Fitting Integration
1. ⏳ Use Gemini shape params for initialization
2. ⏳ Use per-frame landmarks in loss function
3. ⏳ Multi-frame fitting (shared shape, per-frame expression/pose)

## Quality Checks

### Per-Pose Validation
- Face detected
- Pose angles within target range
- Landmarks detected (min 400/468)
- Depth quality acceptable
- Lighting adequate

### Cross-Frame Validation
- Consistent face size across frames
- No major expression changes
- Temporal consistency
- Landmark consistency

## Error Handling

### Invalid Pose
- Show specific feedback: "Turn left more" or "Look down more"
- Visual indicator (arrow direction)
- Auto-retry when pose becomes valid

### Missing Frame
- Allow retaking individual poses
- Show which poses are missing
- Validate before upload

### API Failure
- Fallback to zero initialization
- Log error for debugging
- Show user-friendly message

## User Experience

### Onboarding
1. Brief tutorial: "We'll capture 5 angles of your face"
2. Show example poses
3. Explain why each angle matters

### During Capture
- Clear, simple instructions
- Real-time feedback
- Progress indicator (1/5, 2/5, etc.)
- Success confirmation per pose

### After Capture
- Preview all 5 frames
- Option to retake specific poses
- Upload progress indicator
