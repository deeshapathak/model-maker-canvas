import modal

# Create Modal app
app = modal.App("photogrammetry-backend")

# Create image with basic dependencies
image = (
    modal.Image.debian_slim()
    .pip_install([
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
    ])
)

@app.function(
    image=image,
    gpu="A100",
    timeout=3600,
    memory=16384,
    cpu=4,
    secrets=[
        modal.Secret.from_name("r2-credentials")
    ]
)
@modal.fastapi_endpoint()
def photogrammetry_api():
    """Photogrammetry FastAPI backend with GPU support"""
    from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    import os
    import uuid
    import asyncio
    from pathlib import Path
    from typing import List
    import boto3
    import logging
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    # Create FastAPI app
    app = FastAPI(title="Photogrammetry Backend", version="1.0.0")
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # R2 Configuration
    R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "your_access_key")
    R2_SECRET_KEY = os.getenv("R2_SECRET_KEY", "your_secret_key")
    R2_BUCKET = os.getenv("R2_BUCKET", "3d-models-bucket")
    R2_ENDPOINT = os.getenv("R2_ENDPOINT", "https://your-account-id.r2.cloudflarestorage.com")
    
    # Initialize R2 client
    r2_client = boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name='auto'
    )
    
    # Session storage (in-memory for now)
    sessions = {}
    
    @app.get("/")
    async def root():
        return {"message": "Photogrammetry Backend is running!"}
    
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "service": "photogrammetry-backend"}
    
    @app.post("/upload-session/{session_id}")
    async def upload_session(session_id: str, files: List[UploadFile] = File(...)):
        try:
            # Create session directory
            session_dir = Path(f"/tmp/sessions/{session_id}")
            session_dir.mkdir(parents=True, exist_ok=True)
            
            # Save uploaded files
            uploaded_files = []
            for file in files:
                if file.content_type.startswith('image/'):
                    file_path = session_dir / f"{uuid.uuid4()}_{file.filename}"
                    with open(file_path, "wb") as buffer:
                        content = await file.read()
                        buffer.write(content)
                    uploaded_files.append(str(file_path))
            
            # Initialize session
            sessions[session_id] = {
                "status": "uploaded",
                "images": uploaded_files,
                "created_at": str(uuid.uuid4()),
                "processed_at": None
            }
            
            return {"session_id": session_id, "status": "uploaded", "image_count": len(uploaded_files)}
            
        except Exception as e:
            logger.error(f"Upload error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/process-session/{session_id}")
    async def process_session(session_id: str, background_tasks: BackgroundTasks):
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        sessions[session_id]["status"] = "processing"
        background_tasks.add_task(process_photogrammetry, session_id)
        
        return {"session_id": session_id, "status": "processing"}
    
    @app.get("/result/{session_id}")
    async def get_result(session_id: str):
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = sessions[session_id]
        
        if session["status"] == "completed":
            return {
                "session_id": session_id,
                "status": "completed",
                "glb_url": f"https://{R2_BUCKET}.r2.cloudflarestorage.com/sessions/{session_id}/model.glb",
                "landmarks_url": f"https://{R2_BUCKET}.r2.cloudflarestorage.com/sessions/{session_id}/landmarks.json"
            }
        else:
            return {
                "session_id": session_id,
                "status": session["status"]
            }
    
    async def process_photogrammetry(session_id: str):
        """Mock photogrammetry processing"""
        try:
            logger.info(f"Starting photogrammetry processing for session {session_id}")
            
            # Simulate processing time
            await asyncio.sleep(10)
            
            # Update session status
            sessions[session_id]["status"] = "completed"
            sessions[session_id]["processed_at"] = str(uuid.uuid4())
            
            logger.info(f"Photogrammetry processing completed for session {session_id}")
            
        except Exception as e:
            logger.error(f"Processing error: {e}")
            sessions[session_id]["status"] = "error"
    
    # Run the server
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )

if __name__ == "__main__":
    with app.run():
        pass
