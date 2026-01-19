from __future__ import annotations

import numpy as np
import open3d as o3d


def _nearest_distances(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    target_pc = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(target))
    kdtree = o3d.geometry.KDTreeFlann(target_pc)
    distances = np.zeros(source.shape[0], dtype=np.float32)
    for i, point in enumerate(source):
        _, idx, _ = kdtree.search_knn_vector_3d(point, 1)
        nearest = target[idx[0]]
        distances[i] = float(np.linalg.norm(point - nearest))
    return distances


def surface_error_metrics(mesh_vertices: np.ndarray, cloud_points: np.ndarray) -> dict[str, float]:
    distances = _nearest_distances(mesh_vertices, cloud_points)
    return {
        "mean_mm": float(np.mean(distances) * 1000.0),
        "median_mm": float(np.median(distances) * 1000.0),
        "p95_mm": float(np.percentile(distances, 95) * 1000.0),
        "outlier_ratio": float(np.mean(distances > (0.005))),  # 5mm
    }


def landmark_rms_mm(landmarks: np.ndarray, cloud_points: np.ndarray) -> float:
    distances = _nearest_distances(landmarks, cloud_points)
    return float(np.sqrt(np.mean(distances**2)) * 1000.0)


def nose_error_p95_mm(landmarks: np.ndarray, cloud_points: np.ndarray, nose_tip_idx: int = 1) -> float:
    nose_tip = landmarks[nose_tip_idx : nose_tip_idx + 1]
    distances = _nearest_distances(nose_tip, cloud_points)
    return float(np.percentile(distances, 95) * 1000.0)
