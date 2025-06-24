# 🚀 Photogrammetry System Deployment Guide

This guide will help you deploy the complete photogrammetry system with Cloudflare frontend and GPU backend.

## 📋 System Architecture

```
Frontend (Cloudflare Pages) → Cloudflare Worker → GPU Backend → R2 Storage
```

### Components:
1. **Frontend**: React app on Cloudflare Pages
2. **Worker**: Cloudflare Worker proxy
3. **Backend**: FastAPI GPU service (Modal/RunPod/Replicate)
4. **Storage**: Cloudflare R2 bucket

## 🔧 Phase 1: GPU Backend Deployment

### Option A: Modal (Recommended)

1. **Install Modal**:
   ```bash
   pip install modal
   modal token new
   ```

2. **Create Modal app** (`modal_app.py`):
   ```python
   import modal
   
   stub = modal.Stub("photogrammetry-backend")
   
   # Create image with all dependencies
   image = modal.Image.debian_slim().pip_install([
       "fastapi==0.104.1",
       "uvicorn[standard]==0.24.0",
       "python-multipart==0.0.6",
       "aiofiles==23.2.1",
       "boto3==1.34.0",
       "opencv-python==4.8.1.78",
       "numpy==1.24.3",
       "pillow==10.0.1",
       "requests==2.31.0",
       "python-dotenv==1.0.0",
       "pydantic==2.5.0",
   ]).apt_install([
       "git", "wget", "curl", "build-essential", "cmake",
       "libboost-all-dev", "libeigen3-dev", "libsuitesparse-dev",
       "libfreeimage-dev", "libgoogle-glog-dev", "libgflags-dev",
       "libglew-dev", "libqt5opengl5-dev", "libcgal-dev",
       "libcgal-qt5-dev", "libatlas-base-dev", "meshlab"
   ]).run_commands([
       "cd /tmp && git clone https://github.com/colmap/colmap.git",
       "cd colmap && mkdir build && cd build",
       "cmake .. -DCMAKE_BUILD_TYPE=Release",
       "make -j$(nproc) && make install",
       "cd /tmp && git clone https://github.com/cdcseacave/openMVS.git",
       "cd openMVS && mkdir build && cd build",
       "cmake .. -DCMAKE_BUILD_TYPE=Release",
       "make -j$(nproc) && make install"
   ])
   
   @stub.function(
       image=image,
       gpu="A100",
       timeout=3600,
       memory=32768
   )
   @modal.web_endpoint()
   def photogrammetry_api():
       import uvicorn
       from main import app
       uvicorn.run(app, host="0.0.0.0", port=8000)
   ```

3. **Deploy**:
   ```bash
   modal deploy modal_app.py
   ```

### Option B: RunPod

1. **Create RunPod template**:
   - Base image: `nvidia/cuda:12.2.0-runtime-ubuntu20.04`
   - Install dependencies (see Dockerfile)
   - Expose port 8000

2. **Deploy container**:
   ```bash
   # Use RunPod CLI or web interface
   runpod deploy --template your-template-id
   ```

### Option C: Replicate

1. **Create Replicate model**:
   ```yaml
   # replicate.yaml
   build:
     gpu: a100
     cuda: "12.2"
     system_packages:
       - git
       - wget
       - curl
       - build-essential
       - cmake
       - libboost-all-dev
       - libeigen3-dev
       - libsuitesparse-dev
       - libfreeimage-dev
       - libgoogle-glog-dev
       - libgflags-dev
       - libglew-dev
       - libqt5opengl5-dev
       - libcgal-dev
       - libcgal-qt5-dev
       - libatlas-base-dev
       - meshlab
     python_packages:
       - fastapi==0.104.1
       - uvicorn[standard]==0.24.0
       - python-multipart==0.0.6
       - aiofiles==23.2.1
       - boto3==1.34.0
       - opencv-python==4.8.1.78
       - numpy==1.24.3
       - pillow==10.0.1
       - requests==2.31.0
       - python-dotenv==1.0.0
       - pydantic==2.5.0
   predict: |
     import uvicorn
     from main import app
     uvicorn.run(app, host="0.0.0.0", port=8000)
   ```

2. **Deploy**:
   ```bash
   replicate deploy
   ```

## 🔧 Phase 2: Cloudflare R2 Setup

1. **Create R2 bucket**:
   ```bash
   # Via Cloudflare dashboard or wrangler
   wrangler r2 bucket create 3d-models-bucket
   ```

2. **Configure R2 permissions**:
   ```toml
   # wrangler.toml
   [[r2_buckets]]
   binding = "BUCKET"
   bucket_name = "3d-models-bucket"
   ```

## 🔧 Phase 3: Cloudflare Worker Deployment

1. **Update Worker configuration**:
   ```javascript
   // functions/index.js
   const BACKEND_URL = 'https://your-modal-app.modal.run'; // Your GPU backend URL
   ```

2. **Deploy Worker**:
   ```bash
   wrangler deploy
   ```

3. **Set environment variables**:
   ```bash
   wrangler secret put R2_ACCESS_KEY
   wrangler secret put R2_SECRET_KEY
   ```

## 🔧 Phase 4: Frontend Deployment

1. **Update API endpoints**:
   ```typescript
   // src/components/PhotogrammetryCapture.tsx
   const WORKER_URL = 'https://your-worker.your-subdomain.workers.dev';
   ```

2. **Deploy to Cloudflare Pages**:
   ```bash
   # Via Git integration or wrangler
   wrangler pages deploy dist --project-name your-project
   ```

## 🔧 Phase 5: Environment Configuration

### Backend Environment Variables:
```bash
R2_BUCKET=3d-models-bucket
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY=your_access_key
R2_SECRET_KEY=your_secret_key
```

### Frontend Environment Variables:
```bash
VITE_WORKER_URL=https://your-worker.your-subdomain.workers.dev
VITE_R2_BUCKET=3d-models-bucket
```

## 🧪 Testing the Deployment

1. **Test Backend Health**:
   ```bash
   curl https://your-backend-url/health
   ```

2. **Test Worker Proxy**:
   ```bash
   curl https://your-worker-url/health
   ```

3. **Test Frontend**:
   - Open your Cloudflare Pages URL
   - Try uploading images
   - Check processing pipeline

## 📊 Monitoring & Logs

### Modal Logs:
```bash
modal logs photogrammetry-backend
```

### Worker Logs:
```bash
wrangler tail
```

### R2 Usage:
```bash
wrangler r2 object list 3d-models-bucket
```

## 🔒 Security Considerations

1. **CORS Configuration**:
   - Update CORS origins in backend
   - Configure Worker CORS headers

2. **API Rate Limiting**:
   - Add rate limiting to Worker
   - Monitor usage patterns

3. **File Size Limits**:
   - Set appropriate limits in Worker
   - Monitor R2 storage usage

## 💰 Cost Optimization

1. **GPU Usage**:
   - Use spot instances when possible
   - Implement auto-scaling
   - Monitor GPU utilization

2. **Storage**:
   - Implement file cleanup
   - Use lifecycle policies
   - Monitor R2 costs

3. **Bandwidth**:
   - Optimize image compression
   - Use CDN caching
   - Monitor transfer costs

## 🚨 Troubleshooting

### Common Issues:

1. **GPU Backend Not Responding**:
   - Check Modal/RunPod/Replicate logs
   - Verify GPU availability
   - Check network connectivity

2. **Worker Timeout**:
   - Increase Worker timeout limits
   - Optimize image processing
   - Check backend response times

3. **R2 Upload Failures**:
   - Verify R2 credentials
   - Check bucket permissions
   - Monitor storage limits

### Debug Commands:
```bash
# Check backend status
curl -X GET https://your-backend-url/health

# Test Worker endpoints
curl -X POST https://your-worker-url/api/upload-session/test

# Monitor R2 usage
wrangler r2 object list 3d-models-bucket --prefix sessions/
```

## 📈 Scaling Considerations

1. **Horizontal Scaling**:
   - Deploy multiple backend instances
   - Use load balancer
   - Implement queue system

2. **Vertical Scaling**:
   - Upgrade GPU instances
   - Increase memory allocation
   - Optimize processing pipeline

3. **Caching**:
   - Cache processed models
   - Implement CDN
   - Use Redis for session data

## 🎯 Next Steps

1. **Production Monitoring**:
   - Set up error tracking (Sentry)
   - Implement health checks
   - Add performance monitoring

2. **Feature Enhancements**:
   - Add user authentication
   - Implement model versioning
   - Add batch processing

3. **Optimization**:
   - Profile processing pipeline
   - Optimize COLMAP parameters
   - Implement parallel processing

---

**Need Help?** Check the troubleshooting section or create an issue in the repository.
