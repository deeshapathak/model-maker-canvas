# Gemini API Setup Guide

## Step 1: Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key (starts with `AIza...`)

**Note**: Free tier includes generous limits. For production, consider setting up billing.

## Step 2: Set API Key Locally (for testing)

### Option A: Environment Variable (Recommended)
```bash
export GEMINI_API_KEY="your-api-key-here"
```

### Option B: .env File
Create `backend/.env`:
```
GEMINI_API_KEY=your-api-key-here
```

Then update your local run script to load it.

## Step 3: Set API Key on Render

1. Go to your Render dashboard
2. Select your backend service (`backend-for-rhinovate-ios-app-ply-to-glb`)
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: `your-api-key-here`
6. Click **Save Changes**
7. Render will automatically redeploy

## Step 4: Verify Setup

### Check Backend Logs
After deployment, check Render logs for:
```
INFO: Gemini Vision API service initialized
```

If you see:
```
WARNING: GEMINI_API_KEY not set. Gemini service disabled.
```
Then the API key isn't set correctly.

### Test Locally
```bash
cd /Users/deeshapathak/model-maker-canvas/backend
export GEMINI_API_KEY="your-key-here"
python -c "from gemini_service import get_gemini_service; s = get_gemini_service(); print('Enabled:', s.enabled)"
```

Should output: `Enabled: True`

## Step 5: Test End-to-End

1. **Build iOS app** with new guided capture code
2. **Run guided capture** (5 poses)
3. **Check backend logs** for Gemini API call
4. **Verify** better shape initialization in FLAME fitting

## Fallback Behavior

If Gemini API key is **not set**:
- ✅ System still works (falls back to zero initialization)
- ✅ No errors thrown
- ✅ Logs show: "Gemini service disabled, skipping API call"
- ✅ Current behavior (generic face) continues

## Cost Estimate

- **Free tier**: 15 requests/minute, 1,500 requests/day
- **Paid tier**: $0.001-0.002 per image
- **5-frame scan**: ~$0.003-0.005 per scan
- **100 scans/day**: ~$0.30-0.50/day

## Troubleshooting

### "Gemini SDK not available"
```bash
pip install google-generativeai pillow
```

### "GEMINI_API_KEY not set"
- Check environment variable is set
- Check Render environment variables
- Restart service after setting

### API Errors
- Check API key is valid
- Check API quota/limits
- Check network connectivity from Render

## Security Notes

- ⚠️ **Never commit API key to git**
- ✅ Use environment variables
- ✅ Rotate keys periodically
- ✅ Monitor usage in Google Cloud Console
