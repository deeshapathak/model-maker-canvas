# 🎯 3D Photogrammetry Scanner

A modern web application for creating high-quality 3D models using photogrammetry technology. Built with React, Node.js, and powered by COLMAP, OpenMVS, and MeshLab.

## ✨ Features

- **📸 Real-time Camera Capture**: Capture multiple images from different angles
- **🔧 Advanced Photogrammetry**: COLMAP + OpenMVS + MeshLab pipeline
- **🎨 Modern UI**: Built with React, TypeScript, and shadcn/ui
- **📱 Responsive Design**: Works on desktop and mobile devices
- **⚡ Real-time Processing**: Live progress updates during 3D reconstruction
- **🎯 Facial Landmark Detection**: Automatic detection of facial features
- **☁️ Cloud Deployment Ready**: Modal backend + Cloudflare frontend

## 🏗️ Architecture

```
Frontend (React + TypeScript)
├── Camera capture interface
├── Real-time progress tracking
├── 3D model viewer (Three.js)
└── Cloudflare Pages deployment

Backend (Node.js + FastAPI)
├── Image processing pipeline
├── COLMAP sparse reconstruction
├── OpenMVS dense reconstruction
├── MeshLab mesh cleaning
└── Modal GPU deployment

Storage & Infrastructure
├── Cloudflare R2 (object storage)
├── Cloudflare Workers (API proxy)
└── Modal (GPU compute)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Python 3.9+
- Git
- Modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/3d-photogrammetry-scanner.git
   cd 3d-photogrammetry-scanner
   ```

2. **Install dependencies**
   ```bash
   # Install Node.js dependencies
   npm install
   
   # Install Python dependencies (for backend)
   pip install -r backend/requirements.txt
   ```

3. **Install photogrammetry tools** (optional)
   ```bash
   # macOS
   ./install_photogrammetry.sh
   
   # Linux
   sudo ./install_photogrammetry.sh
   ```

4. **Start the development server**
   ```bash
   npm run dev:full
   ```

5. **Open your browser**
   ```
   http://localhost:8080
   ```

## 📖 Usage

### Basic Workflow

1. **Start Camera Capture**
   - Click "Start Camera Capture" in the Custom Models tab
   - Grant camera permissions when prompted

2. **Capture Images**
   - Take 10-20 photos from different angles around the subject
   - Ensure good lighting and minimal movement
   - Include all sides of the subject

3. **Process 3D Model**
   - Click "Process Images" to start photogrammetry
   - Monitor real-time progress updates
   - Wait for processing to complete (5-10 minutes)

4. **View Results**
   - Download the generated GLB model
   - View facial landmarks and measurements
   - Use the 3D viewer to inspect the model

### Advanced Features

- **Batch Processing**: Process multiple sessions simultaneously
- **Quality Settings**: Adjust reconstruction quality vs. speed
- **Export Formats**: GLB, OBJ, PLY support
- **Landmark Analysis**: Automatic facial feature detection

## 🔧 Development

### Project Structure

```
├── src/                    # Frontend React application
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Utility functions
├── backend/               # Python FastAPI backend
│   ├── main.py           # FastAPI application
│   ├── requirements.txt  # Python dependencies
│   └── Dockerfile        # Docker configuration
├── functions/            # Cloudflare Workers
├── server.js            # Node.js development server
└── modal_app.py         # Modal deployment configuration
```

### Available Scripts

```bash
# Development
npm run dev              # Start frontend only
npm run server           # Start backend only
npm run dev:full         # Start both frontend and backend

# Testing
npm run test             # Run tests
node test_photogrammetry.js  # Test photogrammetry API

# Building
npm run build            # Build for production
npm run preview          # Preview production build

# Deployment
npm run deploy           # Deploy to Cloudflare Pages
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Backend Configuration
PORT=3001
NODE_ENV=development

# Cloudflare R2 (for production)
R2_ACCESS_KEY=your_access_key
R2_SECRET_KEY=your_secret_key
R2_BUCKET=3d-models-bucket
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com

# Modal (for GPU backend)
MODAL_TOKEN_ID=your_modal_token
MODAL_TOKEN_SECRET=your_modal_secret
```

## 🚀 Deployment

### Frontend (Cloudflare Pages)

1. **Connect to GitHub**
   - Push your code to GitHub
   - Connect repository to Cloudflare Pages

2. **Configure build settings**
   ```
   Build command: npm run build
   Build output directory: dist
   Node.js version: 18
   ```

3. **Deploy**
   - Cloudflare Pages will automatically deploy on push

### Backend (Modal)

1. **Install Modal CLI**
   ```bash
   pip install modal
   ```

2. **Authenticate**
   ```bash
   modal token new
   ```

3. **Deploy**
   ```bash
   modal deploy modal_app.py
   ```

### Cloudflare Workers

1. **Install Wrangler**
   ```bash
   npm install -g wrangler
   ```

2. **Authenticate**
   ```bash
   wrangler login
   ```

3. **Deploy**
   ```bash
   wrangler deploy
   ```

## 🛠️ Photogrammetry Pipeline

### Processing Steps

1. **Feature Extraction** (COLMAP)
   - Extract SIFT features from images
   - Match features between images
   - Estimate camera poses

2. **Sparse Reconstruction** (COLMAP)
   - Triangulate 3D points
   - Bundle adjustment optimization
   - Generate sparse point cloud

3. **Dense Reconstruction** (COLMAP)
   - Image undistortion
   - Patch match stereo
   - Stereo fusion

4. **Mesh Reconstruction** (OpenMVS)
   - Interface with COLMAP data
   - Densify point cloud
   - Generate mesh
   - Refine mesh

5. **Mesh Cleaning** (MeshLab)
   - Remove duplicate vertices/faces
   - Fix non-manifold edges
   - Optimize mesh topology

6. **Export & Analysis**
   - Export to GLB format
   - Detect facial landmarks
   - Generate measurements

### Quality Settings

- **Fast**: 5-10 minutes, lower quality
- **Standard**: 10-20 minutes, balanced quality
- **High**: 20-40 minutes, best quality

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [COLMAP](https://colmap.github.io/) - Structure-from-Motion and Multi-View Stereo
- [OpenMVS](https://github.com/cdcseacave/openMVS) - Multi-View Stereo reconstruction
- [MeshLab](https://www.meshlab.net/) - 3D mesh processing
- [Three.js](https://threejs.org/) - 3D graphics library
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Modal](https://modal.com/) - GPU compute platform
- [Cloudflare](https://cloudflare.com/) - Edge computing platform

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/3d-photogrammetry-scanner/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/3d-photogrammetry-scanner/discussions)
- **Email**: your-email@example.com

---

**Made with ❤️ for the 3D scanning community**
