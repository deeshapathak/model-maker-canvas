from __future__ import annotations

import os
import pickle
import sys
from types import SimpleNamespace
from typing import Tuple

import logging
import numpy as np
import open3d as o3d
import torch

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
) -> tuple[o3d.geometry.TriangleMesh, np.ndarray]:
    flame, faces = _load_flame_model(flame_model_path, mediapipe_embedding_path)

    device = torch.device("cpu")
    flame = flame.to(device)

    # Downsample target for faster optimization.
    target_points = point_cloud.voxel_down_sample(voxel_size=0.004)
    target_np = np.asarray(target_points.points, dtype=np.float32)
    if target_np.shape[0] < 500:
        raise ValueError("Point cloud too sparse for FLAME fitting.")
    logger.info("FLAME fitting: target points=%s", target_np.shape[0])

    # Initialize FLAME parameters.
    shape_params = torch.zeros((1, 100), dtype=torch.float32, device=device, requires_grad=True)
    expression_params = torch.zeros((1, 50), dtype=torch.float32, device=device, requires_grad=True)
    pose_params = torch.zeros((1, 6), dtype=torch.float32, device=device, requires_grad=True)
    translation = torch.zeros((1, 3), dtype=torch.float32, device=device, requires_grad=True)
    scale = torch.ones((1, 1), dtype=torch.float32, device=device, requires_grad=True)

    # Avoid torch's numpy bridge to prevent "numpy is not available" runtime errors.
    target_tensor = torch.tensor(target_np.tolist(), device=device, dtype=torch.float32)

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
    rigid_R = torch.from_numpy(icp.transformation[:3, :3]).to(device=device, dtype=torch.float32)
    rigid_t = torch.from_numpy(icp.transformation[:3, 3]).to(device=device, dtype=torch.float32)

    optimizer = torch.optim.Adam(
        [shape_params, expression_params, pose_params, translation, scale], lr=0.01
    )

    def chamfer_distance(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
        distances = torch.cdist(a, b)
        return distances.min(dim=1).values.mean() + distances.min(dim=0).values.mean()

    num_iters = 400
    sample_count = 3000
    target_count = min(target_tensor.shape[0], sample_count)

    for step in range(num_iters):
        optimizer.zero_grad()
        vertices, _ = flame(
            shape_params=shape_params,
            expression_params=expression_params,
            pose_params=pose_params,
        )
        verts = vertices.squeeze(0)
        if verts.shape[0] > sample_count:
            idx = torch.randperm(verts.shape[0], device=device)[:sample_count]
            verts = verts[idx]

        tgt_idx = torch.randperm(target_tensor.shape[0], device=device)[:target_count]
        tgt = target_tensor[tgt_idx]

        verts = verts @ rigid_R.T + rigid_t
        verts = verts * scale + translation
        loss = chamfer_distance(verts, tgt)
        reg = (
            shape_params.pow(2).mean()
            + expression_params.pow(2).mean()
            + pose_params.pow(2).mean()
        )
        loss = loss + 0.0005 * reg
        if not torch.isfinite(loss):
            raise ValueError("FLAME fitting diverged (loss is NaN/Inf).")
        loss.backward()
        optimizer.step()
        with torch.no_grad():
            shape_params.clamp_(-4.0, 4.0)
            expression_params.clamp_(-4.0, 4.0)
            pose_params.clamp_(-1.0, 1.0)
            scale.clamp_(0.5, 2.0)
        if step % 25 == 0 or step == num_iters - 1:
            logger.info("FLAME fitting step=%s loss=%.6f", step, float(loss.detach().cpu().item()))

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
    return flame_mesh, landmarks
