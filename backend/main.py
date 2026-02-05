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

from .fit_types import FitConfig, FitMetrics, FitResult, OverlayConfig
from .flame_fit import fit_flame_mesh, transfer_vertex_colors
from .gemini_service import get_gemini_service
from .metrics import landmark_rms_mm, nose_error_p95_mm, surface_error_metrics
from .overlay import build_overlay_pack, write_overlay_pack
from .qc import build_qc
from .repeatability import repeatability_check
from .units import normalize_units

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
SCAN_DIAGNOSTICS: dict[str, str] = {}
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

    # Store original colors before any processing
    original_colors = None
    original_points = np.asarray(processed.points).copy()
    if processed.has_colors():
        original_colors = np.asarray(processed.colors).copy()
        # Normalize colors to 0-1 range if needed
        if original_colors.size and original_colors.max() > 1.0:
            original_colors = original_colors / 255.0
            processed.colors = o3d.utility.Vector3dVector(original_colors)
        logger.info(f"Point cloud has colors: shape={original_colors.shape}, range=[{original_colors.min():.3f}, {original_colors.max():.3f}]")
    else:
        logger.warning("Point cloud has NO colors - output will be gray")

    if remove_outliers:
        # Get indices of points to keep (Open3D outlier removal may lose colors)
        _, stat_inlier_idx = processed.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)

        # Apply statistical outlier mask
        points_after_stat = original_points[stat_inlier_idx]
        colors_after_stat = original_colors[stat_inlier_idx] if original_colors is not None else None

        # Create new point cloud with preserved colors
        processed = o3d.geometry.PointCloud()
        processed.points = o3d.utility.Vector3dVector(points_after_stat)
        if colors_after_stat is not None:
            processed.colors = o3d.utility.Vector3dVector(colors_after_stat)

        # Now do radius outlier removal
        _, radius_inlier_idx = processed.remove_radius_outlier(nb_points=16, radius=0.02)

        # Apply radius outlier mask
        points_final = points_after_stat[radius_inlier_idx]
        colors_final = colors_after_stat[radius_inlier_idx] if colors_after_stat is not None else None

        # Create final point cloud with preserved colors
        processed = o3d.geometry.PointCloud()
        processed.points = o3d.utility.Vector3dVector(points_final)
        if colors_final is not None:
            processed.colors = o3d.utility.Vector3dVector(colors_final)
            logger.info(f"Colors preserved after outlier removal: {len(colors_final)} vertices")

    if processed.is_empty():
        raise HTTPException(
            status_code=400,
            detail="Point cloud is empty after outlier removal.",
        )

    # Verify colors are still present
    if processed.has_colors():
        final_colors = np.asarray(processed.colors)
        logger.info(f"Final point cloud colors: shape={final_colors.shape}, range=[{final_colors.min():.3f}, {final_colors.max():.3f}]")
    else:
        logger.warning("Colors were LOST during preprocessing!")

    processed.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.02, max_nn=30)
    )
    processed.orient_normals_consistent_tangent_plane(30)
    return processed


def crop_face_region(point_cloud: o3d.geometry.PointCloud) -> o3d.geometry.PointCloud:
    pts = np.asarray(point_cloud.points)
    if pts.shape[0] < 100:
        return point_cloud
    x = pts[:, 0]
    y = pts[:, 1]
    z = pts[:, 2]
    x_min, x_max = np.percentile(x, [10, 90])
    y_min, y_max = np.percentile(y, [10, 90])
    z_min = float(z.min())
    z_max = float(z.max())
    z_range = max(z_max - z_min, 1e-6)
    z_cut = z_min + 0.6 * z_range  # keep closest 60% of depth
    x_mid = float(np.median(x))
    y_mid = float(np.median(y))
    x_range = max(x_max - x_min, 1e-6)
    y_range = max(y_max - y_min, 1e-6)
    radius = 0.6 * max(x_range, y_range)
    radial = np.sqrt((x - x_mid) ** 2 + (y - y_mid) ** 2) <= radius
    mask = (
        (x >= x_min)
        & (x <= x_max)
        & (y >= y_min)
        & (y <= y_max)
        & (z <= z_cut)
        & radial
    )
    if mask.mean() < 0.2:
        return point_cloud
    cropped = o3d.geometry.PointCloud()
    cropped.points = o3d.utility.Vector3dVector(pts[mask])
    if point_cloud.has_colors():
        colors = np.asarray(point_cloud.colors)
        if colors.shape[0] == pts.shape[0]:
            cropped.colors = o3d.utility.Vector3dVector(colors[mask])
    return cropped


def crop_by_landmarks(point_cloud: o3d.geometry.PointCloud, landmarks: np.ndarray) -> o3d.geometry.PointCloud:
    if landmarks.size == 0:
        return point_cloud
    pts = np.asarray(point_cloud.points)
    if pts.shape[0] == 0:
        return point_cloud
    lmk_min = landmarks.min(axis=0)
    lmk_max = landmarks.max(axis=0)
    margin = 0.03  # 30mm margin
    min_xyz = lmk_min - margin
    max_xyz = lmk_max + margin
    mask = (
        (pts[:, 0] >= min_xyz[0])
        & (pts[:, 0] <= max_xyz[0])
        & (pts[:, 1] >= min_xyz[1])
        & (pts[:, 1] <= max_xyz[1])
        & (pts[:, 2] >= min_xyz[2])
        & (pts[:, 2] <= max_xyz[2])
    )
    if mask.mean() < 0.2:
        return point_cloud
    cropped = o3d.geometry.PointCloud()
    cropped.points = o3d.utility.Vector3dVector(pts[mask])
    if point_cloud.has_colors():
        colors = np.asarray(point_cloud.colors)
        if colors.shape[0] == pts.shape[0]:
            cropped.colors = o3d.utility.Vector3dVector(colors[mask])
    return cropped


def pc_stats(point_cloud: o3d.geometry.PointCloud, tag: str) -> dict:
    pts = np.asarray(point_cloud.points)
    if pts.size == 0:
        return {"tag": tag, "n": 0}
    finite = np.isfinite(pts).all(axis=1)
    pts_f = pts[finite]
    if pts_f.shape[0] == 0:
        return {"tag": tag, "n": int(pts.shape[0]), "finite_n": 0}
    bbox_min = pts_f.min(axis=0)
    bbox_max = pts_f.max(axis=0)
    bbox = bbox_max - bbox_min
    z_min = float(pts_f[:, 2].min())
    z_max = float(pts_f[:, 2].max())
    finite_ratio = float(pts_f.shape[0] / pts.shape[0])
    return {
        "tag": tag,
        "n": int(pts.shape[0]),
        "finite_n": int(pts_f.shape[0]),
        "finite_ratio": finite_ratio,
        "bbox": bbox.tolist(),
        "bbox_diag": float(np.linalg.norm(bbox)),
        "z_min": z_min,
        "z_max": z_max,
        "z_range": z_max - z_min,
        "centroid": pts_f.mean(axis=0).tolist(),
    }


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
        stale_diagnostics = SCAN_DIAGNOSTICS.pop(stale_id, None)
        if stale_diagnostics and os.path.exists(stale_diagnostics):
            os.remove(stale_diagnostics)

    return scan_id


def store_landmarks(scan_id: str, landmarks: np.ndarray) -> str:
    os.makedirs(SCAN_DIR, exist_ok=True)
    landmark_path = os.path.join(SCAN_DIR, f"{scan_id}_landmarks.json")
    payload = {"scanId": scan_id, "landmarks": landmarks.tolist()}
    with open(landmark_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    SCAN_LANDMARKS[scan_id] = landmark_path
    return scan_id


def store_diagnostics(scan_id: str, diagnostics: dict) -> str:
    os.makedirs(SCAN_DIR, exist_ok=True)
    diagnostics_path = os.path.join(SCAN_DIR, f"{scan_id}_diagnostics.json")
    with open(diagnostics_path, "w", encoding="utf-8") as handle:
        json.dump(diagnostics, handle)
    SCAN_DIAGNOSTICS[scan_id] = diagnostics_path
    return scan_id


def overlay_meta_path(scan_id: str) -> str:
    return os.path.join(SCAN_DIR, f"{scan_id}_overlay_meta.json")


def overlay_blob_path(scan_id: str, suffix: str) -> str:
    return os.path.join(SCAN_DIR, f"{scan_id}_{suffix}.bin")


def flame_positions_path(scan_id: str) -> str:
    return os.path.join(SCAN_DIR, f"{scan_id}_flame_positions.bin")


def flame_indices_path(scan_id: str) -> str:
    return os.path.join(SCAN_DIR, f"{scan_id}_flame_indices.bin")


def store_flame_buffers(scan_id: str, mesh: o3d.geometry.TriangleMesh) -> None:
    os.makedirs(SCAN_DIR, exist_ok=True)
    vertices = np.asarray(mesh.vertices, dtype=np.float32)
    faces = np.asarray(mesh.triangles, dtype=np.uint32)
    vertices.tofile(flame_positions_path(scan_id))
    faces.tofile(flame_indices_path(scan_id))


logger = logging.getLogger("rhinovate.backend")


def status_path(scan_id: str) -> str:
    return os.path.join(SCAN_DIR, f"{scan_id}_status.json")


def write_status_file(scan_id: str, payload: dict[str, str | int | float]) -> None:
    os.makedirs(SCAN_DIR, exist_ok=True)
    with open(status_path(scan_id), "w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def read_status_file(scan_id: str) -> dict[str, str | int | float] | None:
    path = status_path(scan_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict) and "state" in payload:
            return payload
    except Exception:
        return None
    return None


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
    write_status_file(scan_id, payload)


def process_scan(
    scan_id: str,
    ply_path: str,
    poisson_depth: int,
    target_tris: int,
    remove_outliers: bool,
    unit_scale: Optional[float],
    units: Optional[str],
    gemini_frames: Optional[list[tuple[bytes, str]]] = None,
) -> None:
    try:
        if not os.path.exists(FLAME_MODEL_PATH) or not os.path.exists(MEDIAPIPE_EMBEDDING_PATH):
            raise HTTPException(status_code=500, detail="FLAME model assets not found on server.")

        update_status(scan_id, "processing", stage="read")
        point_cloud = read_point_cloud_from_path(ply_path)
        logger.info("Scan %s stats: %s", scan_id, pc_stats(point_cloud, "raw_ply"))
        update_status(scan_id, "processing", stage="units")
        unit_result = normalize_units(point_cloud, override_scale=unit_scale, override_units=units)
        logger.info("Scan %s stats: %s", scan_id, pc_stats(unit_result.point_cloud, "after_units"))
        if unit_result.warnings:
            update_status(scan_id, "processing", stage="units", message=",".join(unit_result.warnings))

        update_status(scan_id, "processing", stage="crop")
        cropped = crop_face_region(unit_result.point_cloud)
        logger.info("Scan %s stats: %s", scan_id, pc_stats(cropped, "after_crop"))

        update_status(scan_id, "processing", stage="preprocess")
        raw_points = np.asarray(unit_result.point_cloud.points)
        logger.info("Scan %s raw points=%s", scan_id, raw_points.shape[0])
        remove_outliers_effective = remove_outliers or os.getenv("FORCE_OUTLIER_REMOVAL", "1") == "1"
        processed = preprocess_point_cloud(cropped, remove_outliers=remove_outliers_effective)
        processed_points = np.asarray(processed.points)
        logger.info("Scan %s processed points=%s", scan_id, processed_points.shape[0])
        logger.info("Scan %s stats: %s", scan_id, pc_stats(processed, "after_preprocess"))
        
        # Call Gemini API for shape estimation (if frames provided)
        initial_shape_params = None
        print(f"[GEMINI CHECK] Scan {scan_id}: gemini_frames={gemini_frames is not None}, len={len(gemini_frames) if gemini_frames else 0}")
        logger.info(f"Scan {scan_id}: gemini_frames check - exists={gemini_frames is not None}, len={len(gemini_frames) if gemini_frames else 0}")
        if gemini_frames and len(gemini_frames) >= 3:  # Accept 3+ frames (front, left, right)
            update_status(scan_id, "processing", stage="gemini")
            gemini_service = get_gemini_service()
            print(f"[GEMINI CALL] Scan {scan_id}: Calling Gemini API with {len(gemini_frames)} frames (service enabled: {gemini_service.enabled})")
            logger.info("Scan %s: Calling Gemini API with %d frames (service enabled: %s)", 
                       scan_id, len(gemini_frames), gemini_service.enabled)
            gemini_result = gemini_service.analyze_faces(gemini_frames, timeout_seconds=15.0)
            if gemini_result:
                initial_shape_params = gemini_result.get_shape_params_array()
                if initial_shape_params:
                    mean_abs = sum(abs(x) for x in initial_shape_params) / len(initial_shape_params)
                    max_abs = max(abs(x) for x in initial_shape_params)
                    print(f"[GEMINI SUCCESS] Scan {scan_id}: Using Gemini shape params (mean abs: {mean_abs:.4f}, max abs: {max_abs:.4f})")
                    logger.info("Scan %s: Using Gemini shape params (mean abs: %.4f, max abs: %.4f, first 5: %s)", 
                               scan_id, mean_abs, max_abs, initial_shape_params[:5])
                else:
                    print(f"[GEMINI WARNING] Scan {scan_id}: Gemini returned None shape params")
                    logger.warning("Scan %s: Gemini returned None shape params", scan_id)
            else:
                print(f"[GEMINI WARNING] Scan {scan_id}: Gemini analysis returned None")
                logger.warning("Scan %s: Gemini analysis returned None (check API key, model availability, or API errors)", scan_id)
        else:
            print(f"[GEMINI SKIP] Scan {scan_id}: No Gemini frames provided ({len(gemini_frames) if gemini_frames else 0} frames), using zero initialization")
            logger.info("Scan %s: No Gemini frames provided (%s frames), using zero initialization", 
                       scan_id, len(gemini_frames) if gemini_frames else 0)
        
        update_status(scan_id, "processing", stage="fit")
        fit_config = FitConfig(
            w_landmark=4.0,
            w_point2plane=1.0,
            w_nose_multiplier=2.0,
            w_mouth_multiplier=3.0,
            trim_percentile=0.95,
        )
        mesh, landmarks, stage_results, sparse_mode, timed_out = fit_flame_mesh(
            processed,
            flame_model_path=FLAME_MODEL_PATH,
            mediapipe_embedding_path=MEDIAPIPE_EMBEDDING_PATH,
            fit_config=fit_config,
            max_seconds=float(os.getenv("FLAME_FIT_MAX_SECONDS", "60")),
            max_iters=int(os.getenv("FLAME_FIT_MAX_ITERS", "250")),
            freeze_expression=False,
            freeze_jaw=True,
            initial_shape_params=initial_shape_params,  # Pass Gemini shape params
        )
        mesh_vertices = np.asarray(mesh.vertices)
        cloud_points = np.asarray(processed.points)
        metrics = surface_error_metrics(mesh_vertices, cloud_points)
        metrics["nose_p95_mm"] = nose_error_p95_mm(landmarks, cloud_points)
        metrics["landmark_rms_mm"] = landmark_rms_mm(landmarks, cloud_points)
        metrics["units_inferred"] = unit_result.units_inferred
        metrics["unit_scale_applied"] = unit_result.unit_scale_applied
        metrics["nose_definition_version"] = "mp_v1_radius"

        qc = build_qc(metrics, fit_config)
        if sparse_mode:
            qc.warnings.append("POINTCLOUD_SPARSE")
            qc.pass_fit = False
        if timed_out:
            qc.warnings.append("FIT_TIMEOUT")
            qc.pass_fit = False

        should_refit = (
            metrics["outlier_ratio"] > 0.5
            or metrics["landmark_rms_mm"] > 10.0
            or metrics["p95_mm"] > 25.0
        )
        if should_refit:
            update_status(scan_id, "processing", stage="refit")
            # Step 1: refit with frozen expression on the same cloud.
            mesh_refit, landmarks_refit, stage_results_refit, sparse_mode_refit, timed_out_refit = (
                fit_flame_mesh(
                    processed,
                    flame_model_path=FLAME_MODEL_PATH,
                    mediapipe_embedding_path=MEDIAPIPE_EMBEDDING_PATH,
                    fit_config=fit_config,
                    max_seconds=float(os.getenv("FLAME_FIT_MAX_SECONDS", "60")),
                    max_iters=int(os.getenv("FLAME_FIT_MAX_ITERS", "220")),
                    freeze_expression=True,
                    freeze_jaw=True,
                    initial_shape_params=initial_shape_params,  # Use same Gemini shape params
                )
            )
            mesh_vertices_refit = np.asarray(mesh_refit.vertices)
            processed_points = np.asarray(processed.points)
            metrics_refit = surface_error_metrics(mesh_vertices_refit, processed_points)
            metrics_refit["nose_p95_mm"] = nose_error_p95_mm(landmarks_refit, processed_points)
            metrics_refit["landmark_rms_mm"] = landmark_rms_mm(landmarks_refit, processed_points)
            metrics_refit["units_inferred"] = unit_result.units_inferred
            metrics_refit["unit_scale_applied"] = unit_result.unit_scale_applied
            metrics_refit["nose_definition_version"] = "mp_v1_radius"

            qc_refit = build_qc(metrics_refit, fit_config)
            if sparse_mode_refit:
                qc_refit.warnings.append("POINTCLOUD_SPARSE")
                qc_refit.pass_fit = False
            if timed_out_refit:
                qc_refit.warnings.append("FIT_TIMEOUT")
                qc_refit.pass_fit = False

            # Step 2 (optional): landmark-based crop only if landmarks are stable.
            if metrics["landmark_rms_mm"] < 12.0 and metrics["outlier_ratio"] < 0.9:
                refined = crop_by_landmarks(processed, landmarks)
                if len(refined.points) >= 800:
                    mesh_crop, lmk_crop, stage_crop, sparse_crop, timed_crop = fit_flame_mesh(
                        refined,
                        flame_model_path=FLAME_MODEL_PATH,
                        mediapipe_embedding_path=MEDIAPIPE_EMBEDDING_PATH,
                        fit_config=fit_config,
                        max_seconds=float(os.getenv("FLAME_FIT_MAX_SECONDS", "60")),
                        max_iters=int(os.getenv("FLAME_FIT_MAX_ITERS", "200")),
                        freeze_expression=True,
                        freeze_jaw=True,
                    )
                    mesh_crop_vertices = np.asarray(mesh_crop.vertices)
                    refined_points = np.asarray(refined.points)
                    metrics_crop = surface_error_metrics(mesh_crop_vertices, refined_points)
                    metrics_crop["nose_p95_mm"] = nose_error_p95_mm(lmk_crop, refined_points)
                    metrics_crop["landmark_rms_mm"] = landmark_rms_mm(lmk_crop, refined_points)
                    metrics_crop["units_inferred"] = unit_result.units_inferred
                    metrics_crop["unit_scale_applied"] = unit_result.unit_scale_applied
                    metrics_crop["nose_definition_version"] = "mp_v1_radius"

                    qc_crop = build_qc(metrics_crop, fit_config)
                    if sparse_crop:
                        qc_crop.warnings.append("POINTCLOUD_SPARSE")
                        qc_crop.pass_fit = False
                    if timed_crop:
                        qc_crop.warnings.append("FIT_TIMEOUT")
                        qc_crop.pass_fit = False

                    if metrics_crop["p95_mm"] < metrics_refit["p95_mm"]:
                        mesh_refit = mesh_crop
                        landmarks_refit = lmk_crop
                        stage_results_refit = stage_crop
                        sparse_mode_refit = sparse_crop
                        timed_out_refit = timed_crop
                        metrics_refit = metrics_crop
                        qc_refit = qc_crop

            better_refit = metrics_refit["p95_mm"] < metrics["p95_mm"]
            if better_refit:
                mesh = mesh_refit
                landmarks = landmarks_refit
                stage_results = stage_results_refit
                sparse_mode = sparse_mode_refit
                timed_out = timed_out_refit
                metrics = metrics_refit
                qc = qc_refit

        # ─────────────────────────────────────────────────────────────────────
        # PHASE: Non-Rigid ICP Deformation
        # Deform FLAME mesh to exactly match scan geometry for accurate likeness
        # ─────────────────────────────────────────────────────────────────────
        update_status(scan_id, "processing", stage="nonrigid_deform")
        nonrigid_result = None
        flame_base_vertices = None  # Store original FLAME vertices for morphability
        mesh_displacements = None   # Store per-vertex displacements

        try:
            from .nonrigid_icp import deform_template_to_scan, NonRigidICPConfig

            nonrigid_config = NonRigidICPConfig(
                max_iterations=80,        # More iterations to converge
                stiffness=5.0,            # Lower stiffness = more deformation allowed
                landmark_weight=50.0,     # Less landmark constraint = more freedom
                convergence_threshold=1e-5,
                max_correspondence_distance=0.03,  # 30mm - wider search for correspondences
            )

            # Apply non-rigid ICP even with mediocre initial fits (threshold raised to 20mm)
            # This helps when FLAME fitting produces a generic template look
            if not sparse_mode and not timed_out and metrics.get("p95_mm", 100) < 20:
                # Capture FLAME base vertices BEFORE deformation (for morphability)
                flame_base_vertices = np.asarray(mesh.vertices).copy()

                logger.info(f"Scan {scan_id}: Starting non-rigid ICP deformation...")
                nonrigid_result = deform_template_to_scan(
                    template_mesh=mesh,
                    target_cloud=processed,
                    landmark_pairs=None,  # Could add landmark constraints later
                    config=nonrigid_config,
                )

                if nonrigid_result.converged or nonrigid_result.mean_error < 0.010:  # 10mm - more lenient
                    # Apply deformation to mesh
                    mesh.vertices = o3d.utility.Vector3dVector(nonrigid_result.deformed_vertices)

                    # Store displacement vectors for morphability
                    mesh_displacements = nonrigid_result.displacements
                    displacement_path = os.path.join(SCAN_DIR, f"{scan_id}_displacements.npy")
                    np.save(displacement_path, mesh_displacements)

                    logger.info(
                        f"Scan {scan_id}: Non-rigid ICP complete - "
                        f"mean_error={nonrigid_result.mean_error*1000:.2f}mm, "
                        f"p95_error={nonrigid_result.p95_error*1000:.2f}mm, "
                        f"iterations={nonrigid_result.iterations_used}, "
                        f"converged={nonrigid_result.converged}"
                    )

                    # Update metrics with non-rigid results
                    metrics["nonrigid_mean_mm"] = nonrigid_result.mean_error * 1000
                    metrics["nonrigid_p95_mm"] = nonrigid_result.p95_error * 1000
                    metrics["nonrigid_max_mm"] = nonrigid_result.max_error * 1000
                    metrics["nonrigid_converged"] = nonrigid_result.converged
                else:
                    logger.warning(
                        f"Scan {scan_id}: Non-rigid ICP did not converge well "
                        f"(mean_error={nonrigid_result.mean_error*1000:.2f}mm), "
                        f"using FLAME-only mesh"
                    )
                    nonrigid_result = None
                    flame_base_vertices = None  # Don't save if not used
            else:
                reason = []
                if sparse_mode:
                    reason.append("sparse_mode")
                if timed_out:
                    reason.append("timed_out")
                if metrics.get("p95_mm", 100) >= 10:
                    reason.append(f"poor_initial_fit(p95={metrics.get('p95_mm', 'N/A')}mm)")
                logger.info(
                    f"Scan {scan_id}: Skipping non-rigid ICP ({', '.join(reason)})"
                )
        except ImportError as e:
            logger.warning(f"Scan {scan_id}: Non-rigid ICP module not available: {e}")
        except Exception as e:
            logger.warning(f"Scan {scan_id}: Non-rigid ICP failed: {e}, using FLAME-only mesh")

        update_status(scan_id, "processing", stage="overlay")
        overlay_meta = None
        try:
            overlay_config = OverlayConfig(
                enabled=os.getenv("OVERLAY_ENABLED", "1") == "1",
                knn_k=int(os.getenv("OVERLAY_KNN_K", "4")),
                max_dist_m=float(os.getenv("OVERLAY_MAX_DIST_M", "0.03")),
                voxel_size=float(os.getenv("OVERLAY_VOXEL_SIZE", "0.003")),
                max_points=int(os.getenv("OVERLAY_MAX_POINTS", "80000")),
                min_points=int(os.getenv("OVERLAY_MIN_POINTS", "10000")),
            )
            if overlay_config.enabled:
                overlay_pack = build_overlay_pack(
                    unit_result.point_cloud,
                    mesh,
                    overlay_config,
                    flame_base_vertices=flame_base_vertices,
                    mesh_displacements=mesh_displacements,
                )
                overlay_meta = write_overlay_pack(SCAN_DIR, scan_id, overlay_pack)
        except Exception as exc:
            logger.warning("Overlay pack build failed for scan %s: %s", scan_id, exc)
            overlay_meta = {"enabled": False, "reason": "build_failed"}
        repeatability_enabled = os.getenv("ENABLE_REPEATABILITY", "0") == "1"
        if repeatability_enabled and not timed_out:
            repeatability = repeatability_check(
                processed,
                flame_model_path=FLAME_MODEL_PATH,
                mediapipe_embedding_path=MEDIAPIPE_EMBEDDING_PATH,
                config=fit_config,
                runs=int(os.getenv("REPEATABILITY_RUNS", "2")),
            )
            metrics["repeatability_std_mm"] = repeatability
        else:
            metrics["repeatability_std_mm"] = None

        fit_result = FitResult(
            flame_params=dict(
                shape=[],
                expression=[],
                pose=[],
                scale=1.0,
                translation=[],
            ),
            stage_results=stage_results,
            metrics=FitMetrics(**metrics),
            qc=qc,
        )
        update_status(scan_id, "processing", stage="export")
        store_flame_buffers(scan_id, mesh)
        glb_bytes = mesh_to_glb(mesh)
        store_glb(scan_id, glb_bytes)
        store_landmarks(scan_id, landmarks)
        diagnostics_payload = fit_result.model_dump()
        if overlay_meta:
            diagnostics_payload["overlay"] = overlay_meta
        store_diagnostics(scan_id, diagnostics_payload)
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
        # Transfer vertex colors from the point cloud to mesh
        colors = transfer_vertex_colors(np.asarray(mesh.vertices), processed)
        mesh.vertex_colors = o3d.utility.Vector3dVector(colors)
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
    image_front: Optional[UploadFile] = File(None),
    image_left: Optional[UploadFile] = File(None),
    image_right: Optional[UploadFile] = File(None),
    image_down: Optional[UploadFile] = File(None),
    image_up: Optional[UploadFile] = File(None),
    # New 3/4 view angles for better multi-view reconstruction
    image_left_three_quarter: Optional[UploadFile] = File(None),
    image_right_three_quarter: Optional[UploadFile] = File(None),
    poisson_depth: int = Query(9, ge=4, le=12),
    target_tris: int = Query(60000, ge=1000, le=500000),
    remove_outliers: bool = Query(False),
    unit_scale: Optional[float] = Query(None),
    units: Optional[str] = Query(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> JSONResponse:
    print(f"[SCAN CREATE] POST /api/scans - Starting scan creation")
    logger.info("POST /api/scans - Starting scan creation")
    raw_data = await ply.read()
    if not raw_data:
        raise HTTPException(status_code=400, detail="Empty upload.")

    os.makedirs(SCAN_DIR, exist_ok=True)
    scan_id = uuid.uuid4().hex
    ply_path = os.path.join(SCAN_DIR, f"{scan_id}.ply")
    with open(ply_path, "wb") as handle:
        handle.write(raw_data)
    print(f"[SCAN CREATE] Scan {scan_id}: PLY saved ({len(raw_data)} bytes)")
    logger.info(f"Scan {scan_id}: PLY saved ({len(raw_data)} bytes)")
    # Diagnostic: inspect PLY header and first few vertices for color properties
    try:
        header_bytes, rest = raw_data.split(b'end_header', 1)
        header_text = header_bytes.decode(errors='ignore')
        vertex_lines = rest.splitlines()[1:6]  # skip the end_header line
        # Log and print for diagnostic visibility
        header_lines = header_text.splitlines()
        logger.info("PLY header lines:\n%s", "\n".join(header_lines))
        print("PLY header lines:")
        for line in header_lines[:40]:
            print(line)
        logger.info("First 5 vertex lines: %s", vertex_lines)
        print("First 5 vertex lines:", vertex_lines)
        has_color = any(prop in header_text for prop in ["property uchar red", "property uchar green", "property uchar blue", "property uchar r", "property uchar g", "property uchar b"])
        if has_color:
            logger.info("Color properties detected in PLY header")
            print("Color properties detected in PLY header")
        else:
            logger.info("No color properties detected in PLY header")
            print("No color properties detected in PLY header")
    except Exception as e:
        logger.warning(f"PLY diagnostic failed: {e}")
        print(f"PLY diagnostic failed: {e}")
    try:
        header_bytes, rest = raw_data.split(b'end_header', 1)
        header_text = header_bytes.decode(errors='ignore')
        vertex_lines = rest.splitlines()[1:6]  # skip the end_header line
        logger.info("PLY header lines:\n%s", "\n".join(header_text.splitlines()))
        logger.info("First 5 vertex lines: %s", vertex_lines)
        if any(prop in header_text for prop in ["property uchar red", "property uchar green", "property uchar blue", "property uchar r", "property uchar g", "property uchar b"]):
            logger.info("Color properties detected in PLY header")
        else:
            logger.info("No color properties detected in PLY header")
    except Exception as e:
        logger.warning(f"PLY diagnostic failed: {e}")

    # Collect RGB frames for Gemini analysis
    # Priority order: front, 3/4 views (45°), profile views (75°), up/down
    gemini_frames = []
    frame_mapping = [
        (image_front, "front"),
        (image_left_three_quarter, "left_three_quarter"),  # ~45° left
        (image_left, "left"),  # ~75° left profile
        (image_right_three_quarter, "right_three_quarter"),  # ~45° right
        (image_right, "right"),  # ~75° right profile
        (image_down, "down"),
        (image_up, "up"),
    ]

    # Log which images were received
    received_images = [name for img, name in frame_mapping if img is not None]
    print(f"[SCAN CREATE] Scan {scan_id}: Received images: {received_images}")
    logger.info(f"Scan {scan_id}: Received images: {received_images}")
    
    for upload_file, pose_name in frame_mapping:
        if upload_file:
            try:
                image_bytes = await upload_file.read()
                if image_bytes:
                    gemini_frames.append((image_bytes, pose_name))
                    print(f"[SCAN CREATE] Scan {scan_id}: ✅ Received {pose_name} image ({len(image_bytes)} bytes)")
                    logger.info(f"Scan {scan_id}: ✅ Received {pose_name} image ({len(image_bytes)} bytes)")
                else:
                    print(f"[SCAN CREATE] Scan {scan_id}: ⚠️ {pose_name} image file is empty")
                    logger.warning(f"Scan {scan_id}: ⚠️ {pose_name} image file is empty")
            except Exception as e:
                print(f"[SCAN CREATE] Scan {scan_id}: ❌ Failed to read image_{pose_name}: {e}")
                logger.warning(f"Scan {scan_id}: ❌ Failed to read image_{pose_name}: {e}")
        else:
            print(f"[SCAN CREATE] Scan {scan_id}: No {pose_name} image provided")
            logger.debug(f"Scan {scan_id}: No {pose_name} image provided")
    
    print(f"[SCAN CREATE] Scan {scan_id}: 📸 Collected {len(gemini_frames)} frames for Gemini analysis")
    logger.info(f"Scan {scan_id}: 📸 Collected {len(gemini_frames)} frames for Gemini analysis")

    update_status(scan_id, "processing")
    background_tasks.add_task(
        process_scan,
        scan_id,
        ply_path,
        poisson_depth,
        target_tris,
        remove_outliers,
        unit_scale,
        units,
        gemini_frames,  # Pass frames for Gemini analysis
    )

    base_url = str(request.base_url).rstrip("/")
    glb_url = f"{base_url}/api/scans/{scan_id}.glb"
    status_url = f"{base_url}/api/scans/{scan_id}/status"
    return JSONResponse(
        {"scanId": scan_id, "glbUrl": glb_url, "statusUrl": status_url, "state": "processing"}
    )


@app.get("/api/scans/{scan_id}/status")
def get_scan_status(scan_id: str) -> JSONResponse:
    status = SCAN_STATUS.get(scan_id) or read_status_file(scan_id)
    if not status:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if scan_id not in SCAN_STATUS:
        SCAN_STATUS[scan_id] = status

    payload = {"scanId": scan_id, **status}
    if status.get("state") == "ready":
        diagnostics_path = SCAN_DIAGNOSTICS.get(scan_id) or os.path.join(
            SCAN_DIR, f"{scan_id}_diagnostics.json"
        )
        if diagnostics_path and os.path.exists(diagnostics_path):
            try:
                with open(diagnostics_path, "r", encoding="utf-8") as handle:
                    diagnostics = json.load(handle)
                qc = diagnostics.get("qc", {})
                payload["qc_pass"] = qc.get("pass_fit")
                payload["confidence"] = qc.get("confidence")
                payload["warnings"] = qc.get("warnings")
            except Exception:
                pass
    if status.get("message"):
        payload["detail"] = status["message"]
    return JSONResponse(payload)


@app.get("/api/scans/{scan_id}.glb")
def get_scan(scan_id: str) -> FileResponse:
    status = SCAN_STATUS.get(scan_id) or read_status_file(scan_id)
    if not status:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if status.get("state") != "ready":
        raise HTTPException(status_code=409, detail="Scan is still processing.")

    glb_path = SCAN_STORE.get(scan_id) or os.path.join(SCAN_DIR, f"{scan_id}.glb")
    if not glb_path or not os.path.exists(glb_path):
        raise HTTPException(status_code=404, detail="Scan not found.")

    return FileResponse(
        glb_path,
        media_type="model/gltf-binary",
        filename="scan.glb",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/scans/{scan_id}.ply")
def get_scan_ply(scan_id: str) -> FileResponse:
    """Serve the raw PLY point cloud file."""
    ply_path = os.path.join(SCAN_DIR, f"{scan_id}.ply")
    if not os.path.exists(ply_path):
        raise HTTPException(status_code=404, detail="PLY file not found.")
    return FileResponse(
        ply_path,
        media_type="application/octet-stream",
        filename="scan.ply",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/scans/{scan_id}/overlay")
def get_overlay(scan_id: str, request: Request) -> JSONResponse:
    meta_path = overlay_meta_path(scan_id)
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Overlay not found.")
    with open(meta_path, "r", encoding="utf-8") as handle:
        meta = json.load(handle)
    base_url = str(request.base_url).rstrip("/")
    if meta.get("enabled"):
        meta = meta.copy()
        meta["urls"] = {
            "points": f"{base_url}/api/scans/{scan_id}/overlay/{meta['points_bin']}",
            "colors": f"{base_url}/api/scans/{scan_id}/overlay/{meta['colors_bin']}",
            "indices": f"{base_url}/api/scans/{scan_id}/overlay/{meta['indices_bin']}",
            "weights": f"{base_url}/api/scans/{scan_id}/overlay/{meta['weights_bin']}",
            "offsets": f"{base_url}/api/scans/{scan_id}/overlay/{meta['offsets_bin']}",
        }
    return JSONResponse(meta)


@app.get("/api/scans/{scan_id}/overlay/{blob_name}")
def get_overlay_blob(scan_id: str, blob_name: str) -> FileResponse:
    allowed = (
        f"{scan_id}_overlay_points.bin",
        f"{scan_id}_overlay_colors.bin",
        f"{scan_id}_overlay_indices.bin",
        f"{scan_id}_overlay_weights.bin",
        f"{scan_id}_overlay_offsets.bin",
    )
    if blob_name not in allowed:
        raise HTTPException(status_code=404, detail="Overlay blob not found.")
    path = os.path.join(SCAN_DIR, blob_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Overlay blob not found.")
    return FileResponse(path, headers={"Cache-Control": "no-store"})


@app.get("/api/scans/{scan_id}/flame_buffers")
def get_flame_buffers(scan_id: str, request: Request) -> JSONResponse:
    positions_path = flame_positions_path(scan_id)
    indices_path = flame_indices_path(scan_id)
    if not os.path.exists(positions_path) or not os.path.exists(indices_path):
        raise HTTPException(status_code=404, detail="FLAME buffers not found.")
    base_url = str(request.base_url).rstrip("/")
    positions_count = int(os.path.getsize(positions_path) / (4 * 3))
    indices_count = int(os.path.getsize(indices_path) / (4 * 3))
    return JSONResponse(
        {
            "positions_url": f"{base_url}/api/scans/{scan_id}/flame/positions.bin",
            "indices_url": f"{base_url}/api/scans/{scan_id}/flame/indices.bin",
            "positions_count": positions_count,
            "indices_count": indices_count,
        }
    )


@app.get("/api/scans/{scan_id}/flame/{blob_name}")
def get_flame_blob(scan_id: str, blob_name: str) -> FileResponse:
    if blob_name == "positions.bin":
        path = flame_positions_path(scan_id)
    elif blob_name == "indices.bin":
        path = flame_indices_path(scan_id)
    else:
        raise HTTPException(status_code=404, detail="FLAME blob not found.")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="FLAME blob not found.")
    return FileResponse(path, headers={"Cache-Control": "no-store"})


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


@app.get("/api/scans/{scan_id}/diagnostics")
def get_scan_diagnostics(scan_id: str) -> FileResponse:
    status = SCAN_STATUS.get(scan_id)
    if not status:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if status.get("state") != "ready":
        raise HTTPException(status_code=409, detail="Scan is still processing.")

    diagnostics_path = SCAN_DIAGNOSTICS.get(scan_id)
    if not diagnostics_path or not os.path.exists(diagnostics_path):
        raise HTTPException(status_code=404, detail="Diagnostics not found.")

    return FileResponse(
        diagnostics_path,
        media_type="application/json",
        filename="fit_diagnostics.json",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/scans/latest.glb")
def get_latest_scan() -> FileResponse:
    if not SCAN_ORDER:
        raise HTTPException(status_code=404, detail="No scans available.")

    latest_id = SCAN_ORDER[-1]
    return get_scan(latest_id)
