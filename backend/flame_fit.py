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

    shape_params = torch.zeros((1, 100), dtype=torch.float32, device=device)
    expression_params = torch.zeros((1, 50), dtype=torch.float32, device=device)
    pose_params = torch.zeros((1, 6), dtype=torch.float32, device=device)

    with torch.no_grad():
        vertices, _ = flame(
            shape_params=shape_params,
            expression_params=expression_params,
            pose_params=pose_params,
        )

    verts = vertices.squeeze(0).cpu().numpy()
    flame_mesh = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(verts),
        o3d.utility.Vector3iVector(faces),
    )

    flame_points = o3d.geometry.PointCloud(flame_mesh.vertices)
    target_points = point_cloud.voxel_down_sample(voxel_size=0.005)
    source_points = flame_points.voxel_down_sample(voxel_size=0.005)

    target_points.estimate_normals()
    source_points.estimate_normals()

    icp = o3d.pipelines.registration.registration_icp(
        source_points,
        target_points,
        max_correspondence_distance=0.02,
        init=np.eye(4),
        estimation_method=o3d.pipelines.registration.TransformationEstimationPointToPoint(),
        criteria=o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=50),
    )

    flame_mesh.transform(icp.transformation)
    flame_mesh.compute_vertex_normals()
    return flame_mesh
