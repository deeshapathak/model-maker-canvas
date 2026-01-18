from __future__ import annotations

import os
import pickle
import sys
from types import SimpleNamespace
from typing import Tuple

import numpy as np
import open3d as o3d
import torch

VENDOR_PATH = os.path.join(os.path.dirname(__file__), "vendor", "FLAME_PyTorch")
if VENDOR_PATH not in sys.path:
    sys.path.append(VENDOR_PATH)

from flame_pytorch import FLAME  # type: ignore  # noqa: E402


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


def fit_flame_mesh(
    point_cloud: o3d.geometry.PointCloud,
    flame_model_path: str,
    mediapipe_embedding_path: str,
) -> o3d.geometry.TriangleMesh:
    flame, faces = _load_flame_model(flame_model_path, mediapipe_embedding_path)

    device = torch.device("cpu")
    flame = flame.to(device)

    # Downsample target for faster optimization.
    target_points = point_cloud.voxel_down_sample(voxel_size=0.004)
    target_np = np.asarray(target_points.points, dtype=np.float32)
    if target_np.shape[0] < 500:
        raise ValueError("Point cloud too sparse for FLAME fitting.")

    # Initialize FLAME parameters.
    shape_params = torch.zeros((1, 100), dtype=torch.float32, device=device, requires_grad=True)
    expression_params = torch.zeros((1, 50), dtype=torch.float32, device=device, requires_grad=True)
    pose_params = torch.zeros((1, 6), dtype=torch.float32, device=device, requires_grad=True)
    translation = torch.zeros((1, 3), dtype=torch.float32, device=device, requires_grad=True)
    scale = torch.ones((1, 1), dtype=torch.float32, device=device, requires_grad=True)

    # Avoid torch's numpy bridge to prevent "numpy is not available" runtime errors.
    target_tensor = torch.tensor(target_np.tolist(), device=device, dtype=torch.float32)

    # Initialize translation to align centroids.
    with torch.no_grad():
        vertices, _ = flame(
            shape_params=shape_params.detach(),
            expression_params=expression_params.detach(),
            pose_params=pose_params.detach(),
        )
        source_center = vertices.mean(dim=1, keepdim=True)
        target_center = target_tensor.mean(dim=0, keepdim=True)
        translation.copy_(target_center - source_center.squeeze(0))

    optimizer = torch.optim.Adam(
        [shape_params, expression_params, pose_params, translation, scale], lr=0.01
    )

    def chamfer_distance(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
        distances = torch.cdist(a, b)
        return distances.min(dim=1).values.mean() + distances.min(dim=0).values.mean()

    num_iters = 200
    sample_count = 1500
    target_count = min(target_tensor.shape[0], sample_count)

    for _ in range(num_iters):
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

        verts = verts * scale + translation
        loss = chamfer_distance(verts, tgt)
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        final_vertices, _ = flame(
            shape_params=shape_params.detach(),
            expression_params=expression_params.detach(),
            pose_params=pose_params.detach(),
        )
        final_vertices = final_vertices.squeeze(0) * scale + translation

    verts_np = final_vertices.cpu().numpy()
    flame_mesh = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(verts_np),
        o3d.utility.Vector3iVector(faces),
    )
    flame_mesh.compute_vertex_normals()
    return flame_mesh
