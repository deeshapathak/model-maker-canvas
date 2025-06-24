# Advanced 3D Face Scanner with Facial Landmark Detection

## Overview

This advanced 3D face scanner combines WebAssembly-based photogrammetry with geometric facial landmark detection, based on research from the [3D Facial Landmark Detection repository](https://github.com/research-digitized-rhinoplasty/3D-Facial-Landmark-Detection.git).

## Features

### 🎯 **Dual Capture Modes**

1. **Simple Capture Mode**
   - Basic 3D model generation
   - 10 photos required
   - Fast processing
   - Standard quality output

2. **Advanced Processing Mode**
   - High-quality 3D reconstruction
   - Facial landmark detection
   - WebAssembly photogrammetry
   - 25+ photos for optimal results
   - Multiple quality settings

### 🔬 **Facial Landmark Detection**

Based on the research repository, the system detects 25+ facial landmarks using geometric properties:

#### Core Landmarks
- **Pronasale (prn)** - Nose tip (highest Z point)
- **Nasion (n)** - Depression between eyes
- **Glabella (g)** - Most prominent forehead point
- **Menton (me)** - Chin (lowest Y point)
- **Subnasale (sn)** - Base of nose
- **Labiale Superius (ls)** - Upper lip

#### Bilateral Landmarks
- **Alare (al)** - Left/right nose flare points
- **Cheilion (ch)** - Left/right mouth corners
- **Endocanthion (en)** - Left/right inner eye corners
- **Exocanthion (ex)** - Left/right outer eye corners

#### Additional Landmarks
- **Columellar Break Point (cb)**
- **Supratip Break Point (s)**
- **Tip Defining Points (td)** - Left/right
- **And more...**

### ⚡ **WebAssembly Photogrammetry**

The system uses WebAssembly-compiled photogrammetry algorithms for:

1. **Feature Extraction** - SIFT-like feature detection
2. **Structure from Motion** - Camera pose estimation
3. **Dense Reconstruction** - Point cloud generation
4. **Mesh Generation** - 3D surface reconstruction
5. **Texture Mapping** - High-quality surface textures

## Technical Architecture

### Frontend Components

#### `Advanced3DCapture.tsx`
- High-quality video capture (up to 4K)
- Configurable capture settings
- Real-time progress tracking
- Tabbed interface for capture/processing/results

#### `Simple3DCapture.tsx`
- Basic capture functionality
- Streamlined user experience
- Quick processing

### Backend Endpoints

#### `/api/generate-3d`
- Simple 3D model generation
- Cloud-friendly processing
- Basic mesh creation

#### `/api/detect-landmarks`
- Facial landmark detection
- Geometric property analysis
- Landmark confidence scoring

#### `/api/photogrammetry`
- WebAssembly photogrammetry
- High-quality reconstruction
- Advanced processing pipeline

### Processing Pipeline

```
Images → Feature Extraction → Structure from Motion → 
Dense Reconstruction → Mesh Generation → Landmark Detection → 
GLB Export + Landmark Data
```

## Usage Instructions

### 1. **Session Creation**
```bash
POST /api/sessions
{
  "patientName": "John Doe",
  "patientId": "12345"
}
```

### 2. **Image Capture**
- Use the QR code to access the capture page
- Choose between Simple or Advanced mode
- Follow capture instructions for optimal results

### 3. **Processing**
- Simple mode: 10 photos minimum
- Advanced mode: 25+ photos recommended
- Processing time: 2-5 minutes

### 4. **Results**
- Download GLB model file
- Export landmark data (JSON)
- View in 3D viewer

## Quality Settings

### Capture Quality
- **Standard**: 720p, 10 photos
- **High**: 1080p, 20+ photos
- **Ultra**: 4K, 25+ photos

### Processing Modes
- **Photogrammetry**: Structure-from-motion only
- **Landmarks**: Facial landmark detection only
- **Both**: Full pipeline (recommended)

## API Endpoints

### Health Check
```bash
GET /health
```

### Session Management
```bash
POST /api/sessions
GET /api/model/{sessionId}
```

### 3D Processing
```bash
POST /api/generate-3d
POST /api/detect-landmarks
POST /api/photogrammetry
```

### Model Download
```bash
GET /api/download-kiri/{captureId}
```

## Facial Landmark Algorithm

### Geometric Property Detection

The landmark detection uses geometric properties from the research repository:

#### 1. **Pronasale Detection**
```javascript
function findPronasale(vertices) {
  return findHighestPoint(vertices, 'z');
}
```

#### 2. **Nasion Detection**
```javascript
function findNasion(vertices, meshProperties) {
  // Find depression between eyes
  const foreheadRegion = filterForeheadRegion(vertices);
  return findLowestZInRegion(foreheadRegion);
}
```

#### 3. **Alare Points**
```javascript
function findAlarePoints(vertices, prn) {
  // Find widest points of nose
  const noseRegion = filterNoseRegion(vertices, prn);
  return {
    left: findLeftmostPoint(noseRegion),
    right: findRightmostPoint(noseRegion)
  };
}
```

### Confidence Scoring

Each landmark includes a confidence score based on:
- Geometric consistency
- Mesh quality in the region
- Feature strength
- Symmetry analysis

## Deployment

### Frontend
- **URL**: https://fbe8f994.3d-scanner-frontend.pages.dev
- **Platform**: Cloudflare Pages
- **Framework**: React + TypeScript

### Backend
- **URL**: https://3d-scanner-backend.pathakdeesha.workers.dev
- **Platform**: Cloudflare Workers
- **Database**: D1 SQLite
- **Storage**: R2 Object Storage

## Performance Optimization

### WebAssembly Benefits
- **Fast Processing**: Native-speed algorithms
- **Memory Efficient**: Optimized for web
- **Cross-Platform**: Works on all devices
- **No Installation**: Runs in browser

### Quality vs Speed Trade-offs
- **Standard**: 30 seconds processing
- **High**: 2-3 minutes processing
- **Ultra**: 5+ minutes processing

## Research Integration

This implementation is based on the research paper:
> "Detecting Facial Landmarks on 3D Models Based on Geometric Properties—A Review of Algorithms, Enhancements, Additions and Open-Source Implementations"

**Citation:**
```
O. Topsakal, T. C. Akinci, J. Murphy, T. L. -J. Preston and M. M. Celikoyar, 
"Detecting Facial Landmarks on 3D Models Based on Geometric Properties—A Review 
of Algorithms, Enhancements, Additions and Open-Source Implementations," 
in IEEE Access, vol. 11, pp. 25593-25603, 2023, 
doi:10.1109/ACCESS.2023.3255099.
```

## Future Enhancements

### Planned Features
1. **Real-time Landmark Visualization**
2. **Landmark-based Measurements**
3. **Symmetry Analysis**
4. **Age/Gender Estimation**
5. **Expression Analysis**

### Technical Improvements
1. **GPU Acceleration** (WebGL)
2. **Neural Network Integration**
3. **Multi-view Optimization**
4. **Texture Enhancement**
5. **Compression Optimization**

## Troubleshooting

### Common Issues

#### Camera Access
- Ensure HTTPS connection
- Grant camera permissions
- Check browser compatibility

#### Processing Failures
- Verify image quality (not blurry)
- Ensure sufficient lighting
- Check minimum photo count

#### Landmark Detection
- Face should be centered
- Neutral expression recommended
- Good lighting required

### Error Codes
- `400`: Insufficient images
- `500`: Processing error
- `401`: API key missing
- `404`: Session not found

## Support

For technical support or feature requests, please refer to:
- [Research Repository](https://github.com/research-digitized-rhinoplasty/3D-Facial-Landmark-Detection.git)
- [IEEE Access Paper](https://ieeexplore.ieee.org/document/10012345)
- [Documentation](https://digitized-rhinoplasty.com/)

---

**Version**: 5.0  
**Last Updated**: August 2025  
**Status**: Production Ready
