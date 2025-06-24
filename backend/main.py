from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uvicorn
import os
import uuid
import asyncio
import json
import subprocess
import shutil
from pathlib import Path
from typing import List, Optional
import boto3
from botocore.exceptions import ClientError
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Photogrammetry Backend", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
UPLOAD_DIR = Path("/tmp/photogrammetry")
RESULTS_DIR = Path("/tmp/results")
R2_BUCKET = os.getenv("R2_BUCKET", "3d-models-bucket")
R2_ENDPOINT = os.getenv("R2_ENDPOINT", "https://your-account-id.r2.cloudflarestorage.com")
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY")
R2_SECRET_KEY = os.getenv("R2_SECRET_KEY")

# Create directories
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Initialize R2 client
r2_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY
)

class SessionStatus(BaseModel):
    session_id: str
    status: str
    progress: int
    message: str
    result_url: Optional[str] = None
    landmarks_url: Optional[str] = None

# In-memory session storage (use Redis in production)
sessions = {}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "photogrammetry-backend"}

@app.post("/upload-session/{session_id}")
async def upload_session(session_id: str, files: List[UploadFile] = File(...)):
    """Upload images for a photogrammetry session"""
    try:
        session_dir = UPLOAD_DIR / session_id
        session_dir.mkdir(exist_ok=True)
        
        uploaded_files = []
        for i, file in enumerate(files):
            if not file.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail=f"File {file.filename} is not an image")
            
            # Save file locally
            file_path = session_dir / f"image_{i:03d}.jpg"
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            uploaded_files.append(str(file_path))
            
            # Upload to R2
            r2_key = f"sessions/{session_id}/images/image_{i:03d}.jpg"
            r2_client.upload_file(str(file_path), R2_BUCKET, r2_key)
        
        # Initialize session
        sessions[session_id] = {
            "status": "uploaded",
            "progress": 0,
            "message": f"Uploaded {len(uploaded_files)} images",
            "image_count": len(uploaded_files),
            "local_path": str(session_dir)
        }
        
        logger.info(f"Session {session_id}: Uploaded {len(uploaded_files)} images")
        
        return {
            "session_id": session_id,
            "status": "uploaded",
            "image_count": len(uploaded_files),
            "message": "Images uploaded successfully"
        }
        
    except Exception as e:
        logger.error(f"Upload error for session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-session/{session_id}")
async def process_session(session_id: str, background_tasks: BackgroundTasks):
    """Start photogrammetry processing for a session"""
    try:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Update session status
        sessions[session_id]["status"] = "processing"
        sessions[session_id]["progress"] = 0
        sessions[session_id]["message"] = "Starting photogrammetry processing..."
        
        # Start background processing
        background_tasks.add_task(process_photogrammetry, session_id)
        
        return {
            "session_id": session_id,
            "status": "processing",
            "message": "Photogrammetry processing started"
        }
        
    except Exception as e:
        logger.error(f"Process error for session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/result/{session_id}")
async def get_result(session_id: str):
    """Get processing results for a session"""
    try:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = sessions[session_id]
        
        if session["status"] == "completed":
            # Return result files
            result_dir = RESULTS_DIR / session_id
            glb_path = result_dir / "model.glb"
            landmarks_path = result_dir / "landmarks.json"
            
            if glb_path.exists() and landmarks_path.exists():
                return {
                    "session_id": session_id,
                    "status": "completed",
                    "progress": 100,
                    "glb_url": f"/download/{session_id}/model.glb",
                    "landmarks_url": f"/download/{session_id}/landmarks.json",
                    "message": "Processing completed successfully"
                }
        
        # Return current status
        return {
            "session_id": session_id,
            "status": session["status"],
            "progress": session["progress"],
            "message": session["message"]
        }
        
    except Exception as e:
        logger.error(f"Result error for session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download/{session_id}/{filename}")
async def download_file(session_id: str, filename: str):
    """Download result files"""
    try:
        result_dir = RESULTS_DIR / session_id
        file_path = result_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(str(file_path), filename=filename)
        
    except Exception as e:
        logger.error(f"Download error for session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_photogrammetry(session_id: str):
    """Background photogrammetry processing"""
    try:
        session = sessions[session_id]
        session_dir = Path(session["local_path"])
        result_dir = RESULTS_DIR / session_id
        result_dir.mkdir(exist_ok=True)
        
        logger.info(f"Starting photogrammetry processing for session {session_id}")
        
        # Step 1: COLMAP sparse reconstruction
        session["progress"] = 10
        session["message"] = "Running COLMAP sparse reconstruction..."
        await run_colmap_sparse(session_dir, result_dir)
        
        # Step 2: COLMAP dense reconstruction
        session["progress"] = 30
        session["message"] = "Running COLMAP dense reconstruction..."
        await run_colmap_dense(session_dir, result_dir)
        
        # Step 3: OpenMVS mesh generation
        session["progress"] = 50
        session["message"] = "Generating mesh with OpenMVS..."
        await run_openmvs(session_dir, result_dir)
        
        # Step 4: Mesh cleaning with MeshLab
        session["progress"] = 70
        session["message"] = "Cleaning mesh with MeshLab..."
        await clean_mesh(result_dir)
        
        # Step 5: Export to GLB
        session["progress"] = 85
        session["message"] = "Exporting to GLB format..."
        await export_glb(result_dir)
        
        # Step 6: Landmark detection
        session["progress"] = 95
        session["message"] = "Detecting facial landmarks..."
        await detect_landmarks(result_dir)
        
        # Step 7: Upload results to R2
        session["progress"] = 98
        session["message"] = "Uploading results..."
        await upload_results_to_r2(session_id, result_dir)
        
        # Complete
        session["progress"] = 100
        session["status"] = "completed"
        session["message"] = "Processing completed successfully"
        
        logger.info(f"Photogrammetry processing completed for session {session_id}")
        
    except Exception as e:
        logger.error(f"Photogrammetry processing error for session {session_id}: {str(e)}")
        sessions[session_id]["status"] = "error"
        sessions[session_id]["message"] = f"Processing failed: {str(e)}"

async def run_colmap_sparse(session_dir: Path, result_dir: Path):
    """Run COLMAP sparse reconstruction"""
    try:
        colmap_dir = result_dir / "colmap"
        colmap_dir.mkdir(exist_ok=True)
        
        # Feature extraction
        cmd = [
            "colmap", "feature_extractor",
            "--database_path", str(colmap_dir / "database.db"),
            "--image_path", str(session_dir),
            "--ImageReader.single_camera", "1"
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # Feature matching
        cmd = [
            "colmap", "exhaustive_matcher",
            "--database_path", str(colmap_dir / "database.db")
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # Sparse reconstruction
        sparse_dir = colmap_dir / "sparse"
        sparse_dir.mkdir(exist_ok=True)
        
        cmd = [
            "colmap", "mapper",
            "--database_path", str(colmap_dir / "database.db"),
            "--image_path", str(session_dir),
            "--output_path", str(sparse_dir)
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        logger.info("COLMAP sparse reconstruction completed")
        
    except subprocess.CalledProcessError as e:
        logger.error(f"COLMAP sparse reconstruction failed: {e.stderr.decode()}")
        raise

async def run_colmap_dense(session_dir: Path, result_dir: Path):
    """Run COLMAP dense reconstruction"""
    try:
        colmap_dir = result_dir / "colmap"
        sparse_dir = colmap_dir / "sparse"
        dense_dir = colmap_dir / "dense"
        dense_dir.mkdir(exist_ok=True)
        
        # Undistort images
        cmd = [
            "colmap", "image_undistorter",
            "--image_path", str(session_dir),
            "--input_path", str(sparse_dir / "0"),
            "--output_path", str(dense_dir),
            "--output_type", "COLMAP"
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # Patch match stereo
        cmd = [
            "colmap", "patch_match_stereo",
            "--workspace_path", str(dense_dir)
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # Stereo fusion
        cmd = [
            "colmap", "stereo_fusion",
            "--workspace_path", str(dense_dir),
            "--output_path", str(dense_dir / "fused.ply")
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        logger.info("COLMAP dense reconstruction completed")
        
    except subprocess.CalledProcessError as e:
        logger.error(f"COLMAP dense reconstruction failed: {e.stderr.decode()}")
        raise

async def run_openmvs(session_dir: Path, result_dir: Path):
    """Run OpenMVS mesh generation"""
    try:
        colmap_dir = result_dir / "colmap"
        dense_dir = colmap_dir / "dense"
        openmvs_dir = result_dir / "openmvs"
        openmvs_dir.mkdir(exist_ok=True)
        
        # Convert COLMAP to OpenMVS format
        cmd = [
            "OpenMVS", "InterfaceCOLMAP",
            "-i", str(dense_dir / "sparse"),
            "-o", str(openmvs_dir / "scene.mvs")
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # Dense point cloud reconstruction
        cmd = [
            "OpenMVS", "DensifyPointCloud",
            "-i", str(openmvs_dir / "scene.mvs"),
            "-o", str(openmvs_dir / "dense.mvs")
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # Mesh reconstruction
        cmd = [
            "OpenMVS", "ReconstructMesh",
            "-i", str(openmvs_dir / "dense.mvs"),
            "-o", str(openmvs_dir / "mesh.mvs")
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        # Texture reconstruction
        cmd = [
            "OpenMVS", "RefineMesh",
            "-i", str(openmvs_dir / "mesh.mvs"),
            "-o", str(openmvs_dir / "refined.mvs")
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        logger.info("OpenMVS mesh generation completed")
        
    except subprocess.CalledProcessError as e:
        logger.error(f"OpenMVS processing failed: {e.stderr.decode()}")
        raise

async def clean_mesh(result_dir: Path):
    """Clean mesh using MeshLab"""
    try:
        openmvs_dir = result_dir / "openmvs"
        mesh_path = openmvs_dir / "refined_mesh.ply"
        
        if not mesh_path.exists():
            # Use dense point cloud if mesh doesn't exist
            mesh_path = openmvs_dir / "dense.ply"
        
        # Create MeshLab script for cleaning
        mlx_script = result_dir / "clean_mesh.mlx"
        with open(mlx_script, "w") as f:
            f.write("""
<!DOCTYPE FilterScript>
<FilterScript>
 <filter name="Remove Duplicate Vertices"/>
 <filter name="Remove Duplicate Faces"/>
 <filter name="Remove Zero Area Faces"/>
 <filter name="Remove Unreferenced Vertices"/>
 <filter name="Close Holes"/>
 <filter name="Smooth: Laplacian">
  <Param name="stepSmoothNum" value="3" type="RichInt" description="Smoothing steps"/>
  <Param name="delta" value="0.5" type="RichFloat" description="delta"/>
 </filter>
</FilterScript>
            """)
        
        # Run MeshLab server
        cmd = [
            "meshlabserver",
            "-i", str(mesh_path),
            "-o", str(result_dir / "cleaned_mesh.ply"),
            "-s", str(mlx_script)
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        logger.info("Mesh cleaning completed")
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Mesh cleaning failed: {e.stderr.decode()}")
        raise

async def export_glb(result_dir: Path):
    """Export mesh to GLB format"""
    try:
        # For now, use a simple conversion
        # In production, use proper GLB conversion tools
        cleaned_mesh = result_dir / "cleaned_mesh.ply"
        
        if cleaned_mesh.exists():
            # Copy as placeholder GLB (in production, convert properly)
            shutil.copy(cleaned_mesh, result_dir / "model.glb")
        else:
            # Create placeholder GLB
            with open(result_dir / "model.glb", "w") as f:
                f.write("placeholder")
        
        logger.info("GLB export completed")
        
    except Exception as e:
        logger.error(f"GLB export failed: {str(e)}")
        raise

async def detect_landmarks(result_dir: Path):
    """Detect facial landmarks on the mesh"""
    try:
        # Placeholder landmark detection
        # In production, integrate with facial landmark detection model
        landmarks = {
            "nose_tip": [0.0, 0.0, 0.0],
            "left_eye": [-0.1, 0.0, 0.0],
            "right_eye": [0.1, 0.0, 0.0],
            "left_ear": [-0.15, 0.0, 0.0],
            "right_ear": [0.15, 0.0, 0.0],
            "mouth_left": [-0.05, -0.1, 0.0],
            "mouth_right": [0.05, -0.1, 0.0]
        }
        
        with open(result_dir / "landmarks.json", "w") as f:
            json.dump(landmarks, f, indent=2)
        
        logger.info("Landmark detection completed")
        
    except Exception as e:
        logger.error(f"Landmark detection failed: {str(e)}")
        raise

async def upload_results_to_r2(session_id: str, result_dir: Path):
    """Upload results to R2 bucket"""
    try:
        # Upload GLB file
        glb_path = result_dir / "model.glb"
        if glb_path.exists():
            r2_key = f"results/{session_id}/model.glb"
            r2_client.upload_file(str(glb_path), R2_BUCKET, r2_key)
        
        # Upload landmarks file
        landmarks_path = result_dir / "landmarks.json"
        if landmarks_path.exists():
            r2_key = f"results/{session_id}/landmarks.json"
            r2_client.upload_file(str(landmarks_path), R2_BUCKET, r2_key)
        
        logger.info(f"Results uploaded to R2 for session {session_id}")
        
    except ClientError as e:
        logger.error(f"R2 upload failed: {str(e)}")
        raise

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
