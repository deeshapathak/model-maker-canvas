# 3D Face Scanner - Advanced Implementation

A complete 3D face scanning solution using COLMAP + OpenMVS for high-quality photogrammetry-based 3D reconstruction.

## Features

- **4K Video Capture**: High-resolution video recording with automatic keyframe extraction
- **Real-time Face Detection**: Ensures face is centered and visible during capture
- **Quality Control**: Automatic blur detection and lighting assessment
- **COLMAP Integration**: Structure-from-motion for camera pose estimation
- **OpenMVS Processing**: Dense reconstruction and mesh generation
- **Mesh Simplification**: Optimized models for web viewing
- **GLB Export**: Web-ready 3D model format
- **Docker Deployment**: Easy setup with all dependencies included

## Architecture

```
Frontend (React) → Backend (FastAPI) → COLMAP → OpenMVS → MeshLab → GLB
```

### Components

1. **Frontend**: 4K video capture, keyframe extraction, real-time face detection
2. **Backend**: FastAPI server with image processing and 3D reconstruction pipeline
3. **COLMAP**: Feature extraction, matching, and sparse reconstruction
4. **OpenMVS**: Dense point cloud and mesh reconstruction
5. **MeshLab**: Mesh simplification and optimization
6. **Assimp**: GLB format conversion

## Quick Start

### Prerequisites

- Docker and Docker Compose
- NVIDIA GPU with CUDA support (recommended)
- 8GB+ RAM
- 20GB+ free disk space

### Backend Setup

1. **Clone and navigate to backend directory:**
```bash
cd backend
```

2. **Build and start the Docker container:**
```bash
docker-compose up --build
```

3. **Verify the backend is running:**
```bash
curl http://localhost:8000/health
```

### Frontend Integration

1. **Update the backend URL in the component:**
```typescript
// In src/components/AdvancedFaceCapture.tsx
const BACKEND_URL = 'http://localhost:8000'; // Update to your backend URL
```

2. **Import and use the component:**
```typescript
import { AdvancedFaceCapture } from './components/AdvancedFaceCapture';

// In your component
<AdvancedFaceCapture 
  sessionId="unique_session_id"
  onModelReady={(sessionId, modelUrl) => {
    // Handle completed 3D model
    console.log('3D model ready:', modelUrl);
  }}
/>
```

## API Endpoints

### Session Management
- `POST /create-session/{session_id}` - Create new scanning session
- `GET /session-status/{session_id}` - Get session status and progress

### Image Upload
- `POST /upload-image/{session_id}` - Upload individual images with quality checks

### Processing
- `POST /process-session/{session_id}` - Start 3D reconstruction pipeline

### Model Download
- `GET /models/{session_id}.glb` - Download completed 3D model

## Usage Workflow

1. **Session Creation**: Frontend creates a session with unique ID
2. **Video Recording**: 4K video capture with real-time face detection
3. **Keyframe Extraction**: Automatic extraction of ~20 frames from video
4. **Quality Assessment**: Each frame is checked for blur, lighting, and face centering
5. **Upload**: Valid frames are uploaded to backend
6. **3D Processing**: COLMAP → OpenMVS → MeshLab pipeline
7. **Model Delivery**: GLB file ready for download and viewing

## Quality Control Features

### Image Quality Assessment
- **Blur Detection**: Laplacian variance analysis
- **Brightness Check**: Optimal lighting detection
- **Contrast Analysis**: Image clarity assessment

### Face Detection
- **Centering Check**: Ensures face is within 20% tolerance of image center
- **Single Face**: Prevents multiple face detection
- **Real-time Feedback**: Visual indicators during capture

### Processing Validation
- **Minimum Frames**: Requires at least 10 quality frames
- **Progress Tracking**: Real-time status updates
- **Error Handling**: Detailed error messages and recovery

## Performance Optimization

### GPU Acceleration
- CUDA-enabled COLMAP for faster feature extraction
- GPU memory optimization for large datasets
- Parallel processing where possible

### Memory Management
- Streaming video processing
- Efficient keyframe extraction
- Temporary file cleanup

### Model Optimization
- Mesh simplification to ~100k-250k triangles
- Texture optimization for web delivery
- GLB format for efficient loading

## Troubleshooting

### Common Issues

1. **Camera Access Denied**
   - Check browser permissions
   - Ensure HTTPS for production deployment

2. **GPU Not Detected**
   - Verify NVIDIA drivers
   - Check Docker GPU support: `docker run --gpus all nvidia/cuda:12.2.0-base-ubuntu20.04 nvidia-smi`

3. **Processing Timeout**
   - Increase polling timeout in frontend
   - Check backend logs for errors
   - Verify sufficient system resources

4. **Poor Quality Results**
   - Ensure good lighting conditions
   - Check face centering during capture
   - Verify minimum frame requirements

### Debug Mode

Enable detailed logging:
```bash
# Backend
docker-compose logs -f face-scanner-backend

# Frontend
# Check browser console for detailed error messages
```

## Production Deployment

### Environment Variables
```bash
# Backend
BACKEND_URL=https://your-backend-domain.com
CORS_ORIGINS=https://your-frontend-domain.com

# Frontend
REACT_APP_BACKEND_URL=https://your-backend-domain.com
```

### Scaling Considerations
- Use load balancer for multiple backend instances
- Implement Redis for session management
- Use cloud storage for model files
- Consider CDN for model delivery

### Security
- Implement authentication for API endpoints
- Use HTTPS for all communications
- Validate file uploads
- Rate limiting for API calls

## Customization

### Adjusting Quality Parameters
```python
# In backend/main.py
def check_image_quality(image_path: str) -> dict:
    # Modify thresholds for your use case
    if laplacian_var < 100:  # Blur threshold
    if brightness < 50:      # Brightness threshold
    if contrast < 30:        # Contrast threshold
```

### Changing Processing Pipeline
```python
# In backend/main.py
async def process_session_3d(session_id: str):
    # Modify COLMAP parameters
    cmd = [
        "colmap", "feature_extractor",
        "--database_path", str(colmap_dir / "database.db"),
        "--image_path", str(images_dir),
        "--ImageReader.single_camera", "1",
        "--ImageReader.camera_model", "SIMPLE_PINHOLE",
        # Add custom parameters here
    ]
```

### Frontend Customization
```typescript
// In AdvancedFaceCapture.tsx
const constraints = {
  video: {
    width: { ideal: 3840 },  // Adjust resolution
    height: { ideal: 2160 },
    frameRate: { ideal: 30 } // Adjust frame rate
  }
};
```

## Performance Benchmarks

### Processing Times (GPU-enabled)
- **Feature Extraction**: 30-60 seconds for 20 images
- **Sparse Reconstruction**: 1-2 minutes
- **Dense Reconstruction**: 3-5 minutes
- **Mesh Generation**: 1-2 minutes
- **Total Pipeline**: 5-10 minutes

### Model Quality
- **Triangle Count**: 100k-250k (optimized)
- **Texture Resolution**: 2K-4K
- **File Size**: 5-20MB GLB
- **Loading Time**: <2 seconds on modern browsers

## Contributing

1. Fork the repository
2. Create feature branch
3. Implement changes
4. Add tests
5. Submit pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create GitHub issue
- Check troubleshooting section
- Review logs for error details
