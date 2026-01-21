# Deployment Checklist

## ✅ Pre-Deployment Checks

### Security
- [x] No API keys hardcoded in code
- [x] `.gitignore` includes `.env` files
- [x] API keys only in environment variables

### Backend (model-maker-canvas)
- [x] `backend/gemini_service.py` - New modular Gemini service
- [x] `backend/main.py` - Updated to accept 5 images
- [x] `backend/flame_fit.py` - Accepts initial_shape_params
- [x] `backend/requirements.txt` - Added google-generativeai, pillow
- [x] Documentation files added

### iOS (Rhinovate)
- [x] `Rhinovate/CameraViewController.swift` - Guided capture flow

## 📦 Files to Commit

### Backend Repository (model-maker-canvas)
```
Modified:
- backend/flame_fit.py
- backend/main.py
- backend/requirements.txt

New:
- backend/gemini_service.py
- ARCHITECTURE.md
- GEMINI_API_INTEGRATION.md
- GUIDED_CAPTURE_IMPLEMENTATION.md
- IMPLEMENTATION_SUMMARY.md
- SETUP_GEMINI.md
```

### iOS Repository (Rhinovate)
```
Modified:
- Rhinovate/CameraViewController.swift
```

## 🚀 Deployment Steps

### 1. Commit Backend Changes
```bash
cd /Users/deeshapathak/model-maker-canvas
git add backend/gemini_service.py backend/flame_fit.py backend/main.py backend/requirements.txt
git add ARCHITECTURE.md GEMINI_API_INTEGRATION.md GUIDED_CAPTURE_IMPLEMENTATION.md IMPLEMENTATION_SUMMARY.md SETUP_GEMINI.md
git commit -m "feat: Add guided 5-pose capture with Gemini Vision API integration

- Add modular Gemini service for face analysis
- Update /api/scans endpoint to accept 5 images
- Integrate Gemini shape params into FLAME fitting
- Add comprehensive documentation"
git push origin main
```

### 2. Commit iOS Changes
```bash
cd /Users/deeshapathak/Rhinovate
git add Rhinovate/CameraViewController.swift
git commit -m "feat: Implement guided 5-pose capture flow

- Add CapturePose enum and CapturedFrame struct
- Implement step-by-step pose validation
- Add real-time UI feedback and auto-capture
- Upload 5 JPEG images alongside PLY"
git push origin main
```

### 3. Set Gemini API Key on Render
1. Go to Render dashboard
2. Select backend service
3. Environment tab → Add `GEMINI_API_KEY`
4. Save (auto-redeploys)

### 4. Verify Deployment
- Check Render logs for "Gemini Vision API service initialized"
- Test iOS app guided capture flow
- Verify 5 images upload correctly

## ⚠️ Important Notes

1. **API Key**: Must be set on Render after deployment
2. **Fallback**: System works without API key (uses zero initialization)
3. **Dependencies**: Render will auto-install `google-generativeai` and `pillow`
4. **Testing**: Test guided capture flow after deployment

## 🔍 Post-Deployment Verification

- [ ] Backend logs show Gemini service initialized
- [ ] iOS app shows guided capture UI
- [ ] 5 poses capture successfully
- [ ] Images upload to backend
- [ ] Gemini API called (check logs)
- [ ] FLAME fitting uses Gemini shape params
- [ ] Results look less generic
