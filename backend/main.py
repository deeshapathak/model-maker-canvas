from __future__ import annotations

import json
import logging
import os
import tempfile
import traceback
import uuid
from typing import Optional

import numpy as np
import open3d as o3d
import trimesh
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from .flame_fit import fit_flame_mesh

app = FastAPI(title="Model Maker Canvas Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
ASSET_DIR = os.path.join(BASE_DIR, "assets", "flame")
FLAME_MODEL_PATH = os.path.join(ASSET_DIR, "flame2023_Open.pkl")
MEDIAPIPE_EMBEDDING_PATH = os.path.join(ASSET_DIR, "mediapipe_landmark_embedding.npz")

SCAN_DIR = os.path.join(tempfile.gettempdir(), "rhinovate_scans")
SCAN_STORE: dict[str, str] = {}
SCAN_ORDER: list[str] = []
SCAN_STATUS: dict[str, dict[str, str | int | float]] = {}
SCAN_LANDMARKS: dict[str, str] = {}
MAX_SCANS = 10


def read_point_cloud_from_path(ply_path: str) -> o3d.geometry.PointCloud:
    if not os.path.exists(ply_path):
        raise HTTPException(status_code=400, detail="PLY file not found.")

    with open(ply_path, "rb") as handle:
        header = handle.read(64).lstrip().lower()

    if not header.startswith(b"ply"):
        raise HTTPException(status_code=400, detail="File is not a valid PLY.")

    point_cloud = o3d.io.read_point_cloud(ply_path)
    if point_cloud.is_empty():
        raise HTTPException(status_code=400, detail="Point cloud is empty.")

    return point_cloud


def preprocess_point_cloud(
    point_cloud: o3d.geometry.PointCloud,
    remove_outliers: bool,
) -> o3d.geometry.PointCloud:
    processed = point_cloud
    if processed.has_colors():
        colors = np.asarray(processed.colors)
        if colors.size and colors.max() > 1.0:
            processed.colors = o3d.utility.Vector3dVector(colors / 255.0)
    if remove_outliers:
        processed, _ = processed.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)

    if processed.is_empty():
        raise HTTPException(
            status_code=400,
            detail="Point cloud is empty after outlier removal.",
        )

    processed.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.02, max_nn=30)
    )
    processed.orient_normals_consistent_tangent_plane(30)
    return processed


def poisson_reconstruct(
    point_cloud: o3d.geometry.PointCloud,
    poisson_depth: int,
) -> o3d.geometry.TriangleMesh:
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        point_cloud, depth=poisson_depth
    )

    density_values = np.asarray(densities)
    if density_values.size == 0:
        raise HTTPException(status_code=500, detail="Poisson reconstruction failed.")

    # Remove low-density vertices BEFORE cropping to avoid vertex mask mismatch.
    if len(density_values) == len(mesh.vertices):
        density_threshold = float(np.quantile(density_values, 0.01))
        mesh.remove_vertices_by_mask(density_values < density_threshold)

    bbox = point_cloud.get_axis_aligned_bounding_box()
    mesh = mesh.crop(bbox)

    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_duplicated_vertices()
    mesh.remove_non_manifold_edges()

    if len(mesh.triangles) == 0:
        raise HTTPException(status_code=500, detail="Mesh reconstruction produced no faces.")

    return mesh


def decimate_and_finalize(
    mesh: o3d.geometry.TriangleMesh, target_tris: int
) -> o3d.geometry.TriangleMesh:
    if target_tris > 0 and len(mesh.triangles) > target_tris:
        mesh = mesh.simplify_quadric_decimation(target_tris)

    mesh.compute_vertex_normals()
    return mesh


def mesh_to_glb(mesh: o3d.geometry.TriangleMesh) -> bytes:
    vertices = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.triangles)
    colors = np.asarray(mesh.vertex_colors)

    if colors.size:
        colors = (colors * 255).clip(0, 255).astype(np.uint8)
    else:
        colors = None

    tri_mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=colors,
        process=False,
    )
    return trimesh.exchange.gltf.export_glb(tri_mesh)


def store_glb(scan_id: str, glb_bytes: bytes) -> str:
    os.makedirs(SCAN_DIR, exist_ok=True)
    glb_path = os.path.join(SCAN_DIR, f"{scan_id}.glb")
    with open(glb_path, "wb") as handle:
        handle.write(glb_bytes)

    SCAN_STORE[scan_id] = glb_path
    SCAN_ORDER.append(scan_id)

    if len(SCAN_ORDER) > MAX_SCANS:
        stale_id = SCAN_ORDER.pop(0)
        stale_path = SCAN_STORE.pop(stale_id, None)
        if stale_path and os.path.exists(stale_path):
            os.remove(stale_path)
        stale_landmarks = SCAN_LANDMARKS.pop(stale_id, None)
        if stale_landmarks and os.path.exists(stale_landmarks):
            os.remove(stale_landmarks)

    return scan_id


def store_landmarks(scan_id: str, landmarks: np.ndarray) -> str:
    os.makedirs(SCAN_DIR, exist_ok=True)
    landmark_path = os.path.join(SCAN_DIR, f"{scan_id}_landmarks.json")
    payload = {"scanId": scan_id, "landmarks": landmarks.tolist()}
    with open(landmark_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    SCAN_LANDMARKS[scan_id] = landmark_path
    return scan_id


logger = logging.getLogger("rhinovate.backend")


def update_status(
    scan_id: str,
    state: str,
    message: str = "",
    stage: str = "",
    progress: float | None = None,
) -> None:
    payload: dict[str, str | int | float] = {"state": state}
    if message:
        payload["message"] = message
    if stage:
        payload["stage"] = stage
    if progress is not None:
        payload["progress"] = progress
    SCAN_STATUS[scan_id] = payload


def process_scan(
    scan_id: str,
    ply_path: str,
    poisson_depth: int,
    target_tris: int,
    remove_outliers: bool,
) -> None:
    try:
        if not os.path.exists(FLAME_MODEL_PATH) or not os.path.exists(MEDIAPIPE_EMBEDDING_PATH):
            raise HTTPException(status_code=500, detail="FLAME model assets not found on server.")

        update_status(scan_id, "processing", stage="read")
        point_cloud = read_point_cloud_from_path(ply_path)
        update_status(scan_id, "processing", stage="preprocess")
        processed = preprocess_point_cloud(point_cloud, remove_outliers=remove_outliers)
        update_status(scan_id, "processing", stage="fit")
        mesh, landmarks = fit_flame_mesh(
            processed,
            flame_model_path=FLAME_MODEL_PATH,
            mediapipe_embedding_path=MEDIAPIPE_EMBEDDING_PATH,
        )
        update_status(scan_id, "processing", stage="export")
        glb_bytes = mesh_to_glb(mesh)
        store_glb(scan_id, glb_bytes)
        store_landmarks(scan_id, landmarks)
        update_status(scan_id, "ready")
    except Exception as exc:  # pragma: no cover - background errors
        logger.exception("Scan %s failed during processing.", scan_id)
        update_status(scan_id, "failed", str(exc))
    finally:
        if os.path.exists(ply_path):
            os.remove(ply_path)


@app.post("/api/ply-to-glb")
async def ply_to_glb(
    ply: UploadFile = File(...),
    poisson_depth: int = Query(9, ge=4, le=12),
    target_tris: int = Query(60000, ge=1000, le=500000),
    remove_outliers: bool = Query(False),
) -> Response:
    try:
        raw_data = await ply.read()
        point_cloud = read_point_cloud_from_ply(raw_data)
        processed = preprocess_point_cloud(point_cloud, remove_outliers=remove_outliers)
        mesh = poisson_reconstruct(processed, poisson_depth=poisson_depth)
        mesh = decimate_and_finalize(mesh, target_tris=target_tris)
        glb_bytes = mesh_to_glb(mesh)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive error handling
        raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}") from exc

    return Response(
        content=glb_bytes,
        media_type="model/gltf-binary",
        headers={"Content-Disposition": "attachment; filename=scan.glb"},
    )


@app.post("/api/scans")
async def create_scan(
    request: Request,
    ply: UploadFile = File(...),
    poisson_depth: int = Query(9, ge=4, le=12),
    target_tris: int = Query(60000, ge=1000, le=500000),
    remove_outliers: bool = Query(False),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> JSONResponse:
    raw_data = await ply.read()
    if not raw_data:
        raise HTTPException(status_code=400, detail="Empty upload.")

    os.makedirs(SCAN_DIR, exist_ok=True)
    scan_id = uuid.uuid4().hex
    ply_path = os.path.join(SCAN_DIR, f"{scan_id}.ply")
    with open(ply_path, "wb") as handle:
        handle.write(raw_data)

    update_status(scan_id, "processing")
    background_tasks.add_task(
        process_scan,
        scan_id,
        ply_path,
        poisson_depth,
        target_tris,
        remove_outliers,
    )

    base_url = str(request.base_url).rstrip("/")
    glb_url = f"{base_url}/api/scans/{scan_id}.glb"
    status_url = f"{base_url}/api/scans/{scan_id}/status"
    return JSONResponse(
        {"scanId": scan_id, "glbUrl": glb_url, "statusUrl": status_url, "state": "processing"}
    )


@app.get("/api/scans/{scan_id}/status")
def get_scan_status(scan_id: str) -> JSONResponse:
    status = SCAN_STATUS.get(scan_id)
    if not status:
        raise HTTPException(status_code=404, detail="Scan not found.")

    payload = {"scanId": scan_id, **status}
    if status.get("message"):
        payload["detail"] = status["message"]
    return JSONResponse(payload)


@app.get("/api/scans/{scan_id}.glb")
def get_scan(scan_id: str) -> FileResponse:
    status = SCAN_STATUS.get(scan_id)
    if not status:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if status.get("state") != "ready":
        raise HTTPException(status_code=409, detail="Scan is still processing.")

    glb_path = SCAN_STORE.get(scan_id)
    if not glb_path or not os.path.exists(glb_path):
        raise HTTPException(status_code=404, detail="Scan not found.")

    return FileResponse(
        glb_path,
        media_type="model/gltf-binary",
        filename="scan.glb",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/scans/{scan_id}/landmarks")
def get_scan_landmarks(scan_id: str) -> FileResponse:
    status = SCAN_STATUS.get(scan_id)
    if not status:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if status.get("state") != "ready":
        raise HTTPException(status_code=409, detail="Scan is still processing.")

    landmark_path = SCAN_LANDMARKS.get(scan_id)
    if not landmark_path or not os.path.exists(landmark_path):
        raise HTTPException(status_code=404, detail="Landmarks not found.")

    return FileResponse(
        landmark_path,
        media_type="application/json",
        filename="landmarks.json",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/scans/latest.glb")
def get_latest_scan() -> FileResponse:
    if not SCAN_ORDER:
        raise HTTPException(status_code=404, detail="No scans available.")

    latest_id = SCAN_ORDER[-1]
    return get_scan(latest_id)
