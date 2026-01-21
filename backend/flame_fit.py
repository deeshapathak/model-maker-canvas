from __future__ import annotations

import os
import pickle
import sys
from types import SimpleNamespace
from typing import Tuple

import logging
import time
import numpy as np
import open3d as o3d
import torch

from .fit_types import FitConfig, StageResult

VENDOR_PATH = os.path.join(os.path.dirname(__file__), "vendor", "FLAME_PyTorch")
if VENDOR_PATH not in sys.path:
    sys.path.append(VENDOR_PATH)

from flame_pytorch import FLAME  # type: ignore  # noqa: E402

logger = logging.getLogger("rhinovate.backend")


def _ensure_static_embedding(mediapipe_npz: str, output_pkl: str) -> str:
    if os.path.exists(output_pkl):
        return output_pkl

    embeddings = np.load(mediapipe_npz, allow_pickle=True)
    lmk_face_idx = embeddings["lmk_face_idx"]
    lmk_b_coords = embeddings["lmk_b_coords"]

    payload = {
        "lmk_face_idx": lmk_face_idx,
        "lmk_b_coords": lmk_b_coords,
    }

    with open(output_pkl, "wb") as handle:
        pickle.dump(payload, handle)

    return output_pkl


def _load_flame_model(flame_model_path: str, mediapipe_embedding_path: str) -> Tuple[FLAME, np.ndarray]:
    static_embedding_path = os.path.join(
        os.path.dirname(mediapipe_embedding_path), "mediapipe_static_embedding.pkl"
    )
    static_embedding_path = _ensure_static_embedding(mediapipe_embedding_path, static_embedding_path)

    config = SimpleNamespace(
        flame_model_path=flame_model_path,
        static_landmark_embedding_path=static_embedding_path,
        dynamic_landmark_embedding_path=static_embedding_path,
        shape_params=100,
        expression_params=50,
        pose_params=6,
        use_face_contour=False,
        use_3D_translation=False,
        optimize_eyeballpose=False,
        optimize_neckpose=False,
        batch_size=1,
    )

    flame = FLAME(config)
    faces = flame.faces
    return flame, faces


def compute_flame_landmarks(
    vertices: np.ndarray,
    faces: np.ndarray,
    mediapipe_embedding_path: str,
) -> np.ndarray:
    embeddings = np.load(mediapipe_embedding_path, allow_pickle=True)
    face_indices = embeddings["lmk_face_idx"]
    bary_coords = embeddings["lmk_b_coords"]

    landmarks = np.zeros((face_indices.shape[0], 3), dtype=np.float32)
    for i, face_idx in enumerate(face_indices):
        face = faces[int(face_idx)]
        v0, v1, v2 = vertices[face[0]], vertices[face[1]], vertices[face[2]]
        w0, w1, w2 = bary_coords[i]
        landmarks[i] = w0 * v0 + w1 * v1 + w2 * v2
    return landmarks


def transfer_vertex_colors(
    mesh_vertices: np.ndarray,
    point_cloud: o3d.geometry.PointCloud,
    k_neighbors: int = 5,
) -> np.ndarray:
    if not point_cloud.has_colors():
        return np.full((mesh_vertices.shape[0], 3), 0.85, dtype=np.float32)

    cloud_points = np.asarray(point_cloud.points)
    cloud_colors = np.asarray(point_cloud.colors)
    if cloud_points.size == 0 or cloud_colors.size == 0:
        return np.full((mesh_vertices.shape[0], 3), 0.85, dtype=np.float32)

    kdtree = o3d.geometry.KDTreeFlann(point_cloud)
    colors = np.zeros((mesh_vertices.shape[0], 3), dtype=np.float32)
    for i, vertex in enumerate(mesh_vertices):
        _, idx, _ = kdtree.search_knn_vector_3d(vertex, k_neighbors)
        colors[i] = cloud_colors[idx].mean(axis=0)
    return colors


def fit_flame_mesh(
    point_cloud: o3d.geometry.PointCloud,
    flame_model_path: str,
    mediapipe_embedding_path: str,
    fit_config: FitConfig | None = None,
    max_seconds: float = 60.0,
    max_iters: int = 250,
    freeze_expression: bool = False,
    freeze_jaw: bool = False,
) -> tuple[o3d.geometry.TriangleMesh, np.ndarray, list[StageResult], bool, bool]:
    flame, faces = _load_flame_model(flame_model_path, mediapipe_embedding_path)

    device = torch.device("cpu")
    flame = flame.to(device)

    fit_config = fit_config or FitConfig()

    raw_points = np.asarray(point_cloud.points)
    raw_count = raw_points.shape[0]
    raw_diag = 0.0
    if raw_points.size:
        raw_bbox = raw_points.max(axis=0) - raw_points.min(axis=0)
        raw_diag = float(np.linalg.norm(raw_bbox))

    # Downsample target for faster optimization, but keep raw if already sparse
    # or if the scan collapses into a tiny bbox (unit or depth issues).
    if raw_count < 2000 or raw_diag < 0.02:
        logger.info("FLAME fitting: using raw points (raw=%s, diag=%.4f)", raw_count, raw_diag)
        target_points = point_cloud
    else:
        voxel_size = max(0.001, raw_diag / 200.0)
        target_points = point_cloud.voxel_down_sample(voxel_size=voxel_size)
    if not target_points.has_normals():
        target_points.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.02, max_nn=30)
        )
    target_np = np.asarray(target_points.points, dtype=np.float32)
    target_normals_np = np.asarray(target_points.normals, dtype=np.float32)
    target_diag = 0.0
    target_z_range = 0.0
    if target_np.size:
        target_bbox = target_np.max(axis=0) - target_np.min(axis=0)
        target_diag = float(np.linalg.norm(target_bbox))
        target_z_range = float(target_np[:, 2].max() - target_np[:, 2].min())
    sparse_mode = False
    if target_diag < 0.03 or target_z_range < 0.01:
        logger.warning(
            "FLAME fitting collapse detected (diag=%.4f, z_range=%.4f). Using raw points.",
            target_diag,
            target_z_range,
        )
        target_points = point_cloud
        if not target_points.has_normals():
            target_points.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.02, max_nn=30)
            )
        target_np = np.asarray(target_points.points, dtype=np.float32)
        target_normals_np = np.asarray(target_points.normals, dtype=np.float32)
        if target_np.size:
            target_bbox = target_np.max(axis=0) - target_np.min(axis=0)
            target_diag = float(np.linalg.norm(target_bbox))
            target_z_range = float(target_np[:, 2].max() - target_np[:, 2].min())
    if target_np.shape[0] < 200:
        raise ValueError(
            "Point cloud too sparse for FLAME fitting "
            f"(raw={raw_count}, downsampled={target_np.shape[0]}, diag={raw_diag:.4f}, "
            f"target_diag={target_diag:.4f}, z_range={target_z_range:.4f})."
        )
    if target_np.shape[0] < 500:
        logger.warning("Point cloud low density for FLAME fitting: %s", target_np.shape[0])
        sparse_mode = True
    if target_np.shape[0] > 2000:
        rng = np.random.default_rng(42)
        idx = rng.choice(target_np.shape[0], size=2000, replace=False)
        target_np = target_np[idx]
        target_normals_np = target_normals_np[idx]
    logger.info("FLAME fitting: target points=%s", target_np.shape[0])

    # Initialize FLAME parameters.
    shape_params = torch.zeros((1, 100), dtype=torch.float32, device=device, requires_grad=True)
    expression_params = torch.zeros((1, 50), dtype=torch.float32, device=device, requires_grad=not freeze_expression)
    pose_params = torch.zeros((1, 6), dtype=torch.float32, device=device, requires_grad=True)
    translation = torch.zeros((1, 3), dtype=torch.float32, device=device, requires_grad=True)
    scale = torch.ones((1, 1), dtype=torch.float32, device=device, requires_grad=True)

    # Avoid torch's numpy bridge to prevent "numpy is not available" runtime errors.
    target_tensor = torch.tensor(target_np.tolist(), device=device, dtype=torch.float32)
    target_normals = torch.tensor(target_normals_np.tolist(), device=device, dtype=torch.float32)

    # Initialize translation + scale to align centroids and approximate size.
    with torch.no_grad():
        vertices, _ = flame(
            shape_params=shape_params.detach(),
            expression_params=expression_params.detach(),
            pose_params=pose_params.detach(),
        )
        source_center = vertices.mean(dim=1, keepdim=True)
        target_center = target_tensor.mean(dim=0, keepdim=True)
        translation.copy_(target_center - source_center.squeeze(0))
        source_min, _ = vertices.min(dim=1)
        source_max, _ = vertices.max(dim=1)
        target_min = target_tensor.min(dim=0).values
        target_max = target_tensor.max(dim=0).values
        source_extent = (source_max - source_min).mean().clamp(min=1e-6)
        target_extent = (target_max - target_min).mean().clamp(min=1e-6)
        scale.copy_(target_extent / source_extent)

    # Rigid ICP alignment for rotation initialization.
    neutral_vertices = np.asarray(vertices.squeeze(0).detach().cpu().tolist(), dtype=np.float32)
    source_cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(neutral_vertices))
    source_cloud = source_cloud.voxel_down_sample(voxel_size=0.005)
    target_down = target_points.voxel_down_sample(voxel_size=0.005)
    source_cloud.estimate_normals()
    target_down.estimate_normals()
    icp = o3d.pipelines.registration.registration_icp(
        source_cloud,
        target_down,
        max_correspondence_distance=0.02,
        init=np.eye(4),
        estimation_method=o3d.pipelines.registration.TransformationEstimationPointToPoint(),
        criteria=o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=50),
    )
    rigid_R = torch.tensor(icp.transformation[:3, :3].tolist(), device=device, dtype=torch.float32)
    rigid_t = torch.tensor(icp.transformation[:3, 3].tolist(), device=device, dtype=torch.float32)

    if freeze_jaw:
        with torch.no_grad():
            pose_params[:, 3:] = 0

    stage_results: list[StageResult] = []
    timed_out = False

    def huber(x: torch.Tensor, delta: float) -> torch.Tensor:
        abs_x = torch.abs(x)
        quadratic = torch.minimum(abs_x, torch.tensor(delta, device=x.device))
        linear = abs_x - quadratic
        return 0.5 * quadratic**2 + delta * linear

    def compute_landmarks(vertices_tensor: torch.Tensor) -> torch.Tensor:
        embeddings = np.load(mediapipe_embedding_path, allow_pickle=True)
        face_indices = embeddings["lmk_face_idx"].tolist()
        bary_coords = embeddings["lmk_b_coords"].tolist()
        face_indices_tensor = torch.tensor(face_indices, device=device, dtype=torch.long)
        bary_tensor = torch.tensor(bary_coords, device=device, dtype=torch.float32)
        faces_tensor = torch.tensor(np.asarray(faces).tolist(), device=device, dtype=torch.long)
        v0 = vertices_tensor[faces_tensor[face_indices_tensor, 0]]
        v1 = vertices_tensor[faces_tensor[face_indices_tensor, 1]]
        v2 = vertices_tensor[faces_tensor[face_indices_tensor, 2]]
        return (
            bary_tensor[:, 0:1] * v0
            + bary_tensor[:, 1:2] * v1
            + bary_tensor[:, 2:3] * v2
        )

    def nose_weights(verts: torch.Tensor, landmarks: torch.Tensor) -> torch.Tensor:
        # Nose tip is index 1 in MediaPipe Face Mesh.
        nose_tip = landmarks[1]
        dists = torch.norm(verts - nose_tip, dim=1)
        radius_m = fit_config.nose_radius_mm / 1000.0
        weights = torch.ones_like(dists)
        weights[dists <= radius_m] = fit_config.w_nose_multiplier
        return weights

    def compute_losses(verts: torch.Tensor) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
        distances = torch.cdist(verts, target_tensor)
        src_min, src_idx = distances.min(dim=1)
        tgt_min, _ = distances.min(dim=0)

        lmk = compute_landmarks(verts)
        weights = nose_weights(verts, lmk)

        src_mask = None
        if fit_config.trim_percentile:
            trim = fit_config.trim_percentile
            src_thresh = torch.quantile(src_min, trim)
            tgt_thresh = torch.quantile(tgt_min, trim)
            src_mask = src_min <= src_thresh
            src_min = src_min[src_mask]
            weights = weights[src_mask]
            tgt_min = tgt_min[tgt_min <= tgt_thresh]

        chamfer = (src_min * weights).mean() + tgt_min.mean()

        # Point-to-plane term using nearest target normals.
        tgt_nn = target_tensor[src_idx]
        tgt_normals = target_normals[src_idx]
        plane_dist = ((verts - tgt_nn) * tgt_normals).sum(dim=1)
        if src_mask is not None:
            plane_dist = plane_dist[src_mask]
        point2plane = (huber(plane_dist, fit_config.huber_delta) * weights).mean()

        # Landmark loss (landmarks to nearest point in cloud).
        lmk_dist = torch.cdist(lmk, target_tensor).min(dim=1).values
        mouth_indices = torch.tensor(
            [0, 13, 14, 17, 61, 78, 308, 291],
            device=device,
            dtype=torch.long,
        )
        mouth_indices = mouth_indices[mouth_indices < lmk.shape[0]]
        lmk_weights = torch.ones_like(lmk_dist)
        if mouth_indices.numel() > 0:
            lmk_weights[mouth_indices] = fit_config.w_mouth_multiplier
        landmark = (huber(lmk_dist, fit_config.huber_delta) * lmk_weights).mean()

        return chamfer, {
            "chamfer": chamfer,
            "point2plane": point2plane,
            "landmark": landmark,
        }

    def optimize_stage(name: str, iters: int, params: list[torch.Tensor]) -> None:
        nonlocal timed_out
        optimizer = torch.optim.Adam(params, lr=0.01)
        start_ts = time.time()
        best_loss = float("inf")
        stale_steps = 0

        for step in range(min(iters, max_iters)):
            if time.time() - start_ts > max_seconds:
                timed_out = True
                break
            optimizer.zero_grad()
            vertices, _ = flame(
                shape_params=shape_params,
                expression_params=expression_params,
                pose_params=pose_params,
            )
            verts = vertices.squeeze(0)

            verts = verts @ rigid_R.T + rigid_t
            verts = verts * scale + translation

            chamfer, terms = compute_losses(verts)
            reg = (
                fit_config.w_prior_shape * shape_params.pow(2).mean()
                + fit_config.w_prior_expr * expression_params.pow(2).mean()
                + fit_config.w_prior_jaw * pose_params[:, 3:].pow(2).mean()
            )
            loss = (
                fit_config.w_chamfer * terms["chamfer"]
                + fit_config.w_point2plane * terms["point2plane"]
                + fit_config.w_landmark * terms["landmark"]
                + reg
            )

            if not torch.isfinite(loss):
                raise ValueError("FLAME fitting diverged (loss is NaN/Inf).")
            loss.backward()
            if freeze_jaw and pose_params.grad is not None:
                pose_params.grad[:, 3:] = 0
            optimizer.step()
            with torch.no_grad():
                shape_params.clamp_(-4.0, 4.0)
                expression_params.clamp_(-4.0, 4.0)
                pose_params.clamp_(-1.0, 1.0)
                jaw_max = fit_config.jaw_max_rad
                pose_params[:, 3:] = pose_params[:, 3:].clamp(-jaw_max, jaw_max)
                if freeze_jaw:
                    pose_params[:, 3:] = 0
                scale.clamp_(0.5, 2.0)

            loss_value = float(loss.detach().cpu().item())
            if loss_value + 1e-4 < best_loss:
                best_loss = loss_value
                stale_steps = 0
            else:
                stale_steps += 1
                if stale_steps >= 12:
                    break

        stage_results.append(
            StageResult(
                name=name,
                loss=best_loss,
                duration_ms=(time.time() - start_ts) * 1000.0,
            )
        )

    # Stage 1: rigid only.
    optimize_stage(
        "rigid",
        fit_config.iters_pose,
        [pose_params, translation, scale],
    )

    if not sparse_mode and not freeze_expression:
        # Stage 2: expression + rigid.
        optimize_stage(
            "expression",
            fit_config.iters_expr,
            [expression_params, pose_params, translation, scale],
        )

        # Stage 3: shape + expression + rigid.
        optimize_stage(
            "shape",
            fit_config.iters_shape,
        [shape_params, expression_params, pose_params, translation, scale],
        )

    with torch.no_grad():
        final_vertices, _ = flame(
            shape_params=shape_params.detach(),
            expression_params=expression_params.detach(),
            pose_params=pose_params.detach(),
        )
        final_vertices = final_vertices.squeeze(0)
        final_vertices = final_vertices @ rigid_R.T + rigid_t
        final_vertices = final_vertices * scale + translation

    verts_np = np.asarray(final_vertices.detach().cpu().tolist(), dtype=np.float32)
    flame_mesh = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(verts_np),
        o3d.utility.Vector3iVector(faces),
    )
    vertex_colors = transfer_vertex_colors(verts_np, point_cloud)
    flame_mesh.vertex_colors = o3d.utility.Vector3dVector(vertex_colors)
    flame_mesh.compute_vertex_normals()
    landmarks = compute_flame_landmarks(verts_np, np.asarray(faces), mediapipe_embedding_path)
    logger.info("FLAME fitting complete: vertices=%s faces=%s",
                len(flame_mesh.vertices), len(flame_mesh.triangles))
    return flame_mesh, landmarks, stage_results, sparse_mode, timed_out
