# Architecture: Modular Gemini Integration

## Design Philosophy

**Current Strategy**: Use Gemini Vision API as a temporary solution to get clinic-ready results quickly, while building internal CV pipelines in parallel.

**Future Strategy**: Replace Gemini service with internal CV pipeline without changing FLAME fitting code.

## Modular Architecture

### Service Layer Pattern

```
┌─────────────────────────────────────────┐
│         FLAME Fitting Layer             │
│  (fit_flame_mesh, process_scan)        │
│  - No knowledge of Gemini              │
│  - Just accepts initial_shape_params   │
└─────────────────────────────────────────┘
                    ▲
                    │ initial_shape_params
                    │
┌─────────────────────────────────────────┐
│      Gemini Service (gemini_service.py) │
│  - analyze_faces(frames) → result      │
│  - Clean interface                      │
│  - Easy to swap out                    │
└─────────────────────────────────────────┘
                    ▲
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────┴──────┐      ┌────────┴────────┐
│ Gemini API   │      │ Internal CV     │
│ (Current)    │      │ (Future)        │
└──────────────┘      └─────────────────┘
```

### Key Interfaces

**FaceAnalysisResult** (in `gemini_service.py`):
- `initial_shape_params: List[float]` - 100-dim FLAME shape vector
- `frame_estimates: List[Dict]` - Per-frame landmarks, expressions
- `get_shape_params_array()` - Returns shape params for FLAME

**GeminiService**:
- `analyze_faces(frames) -> Optional[FaceAnalysisResult]`
- Returns `None` if unavailable (fallback to zero initialization)
- No exceptions thrown - graceful degradation

**FLAME Fitting**:
- `fit_flame_mesh(..., initial_shape_params=None)`
- If `None`: uses zero initialization (mean face)
- If provided: uses Gemini-estimated shape

## Replacement Strategy

To replace Gemini with internal CV:

1. **Create new service** (`backend/internal_cv_service.py`):
   ```python
   class InternalCVService:
       def analyze_faces(self, frames):
           # Your internal CV pipeline
           return FaceAnalysisResult(...)
   ```

2. **Update main.py**:
   ```python
   # Change this:
   gemini_service = get_gemini_service()
   
   # To this:
   cv_service = get_internal_cv_service()
   ```

3. **No changes needed** to:
   - `flame_fit.py`
   - `process_scan()` function
   - FLAME fitting logic

## Current Implementation

### Backend Flow

1. **iOS uploads**: PLY + 5 JPEG images (`image_front`, `image_left`, etc.)
2. **Backend receives**: Extracts images, calls Gemini
3. **Gemini analyzes**: Returns `FaceAnalysisResult` with shape params
4. **FLAME fitting**: Uses shape params for initialization
5. **Fallback**: If Gemini fails, uses zero initialization (current behavior)

### Error Handling

- Gemini API failure → Log warning → Use zero initialization
- Missing images → Log info → Use zero initialization  
- Invalid response → Log error → Use zero initialization

**No user-facing errors** - system gracefully degrades to current behavior.

## Benefits

✅ **Clinic-ready now**: Gemini provides better initial shape
✅ **Modular**: Easy to swap out Gemini later
✅ **No breaking changes**: FLAME fitting unchanged
✅ **Graceful degradation**: Falls back to current behavior if Gemini unavailable

## Next Steps

1. ✅ Gemini service module created
2. ✅ Backend endpoint updated
3. ✅ FLAME fitting integrated
4. ⏳ iOS guided capture (5 poses)
5. ⏳ Test end-to-end flow
6. ⏳ Monitor Gemini API costs/performance
7. ⏳ Build internal CV pipeline (parallel work)
