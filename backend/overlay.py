from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Tuple

import numpy as np
import open3d as o3d

from .fit_types import OverlayConfig


@dataclass
class OverlayPack:
    points: np.ndarray
    colors: np.ndarray
    indices: np.ndarray
    weights: np.ndarray
    offsets: np.ndarray
    meta: dict


def _as_float32(arr: np.ndarray) -> np.ndarray:
    return np.asarray(arr, dtype=np.float32)


def _as_uint8(arr: np.ndarray) -> np.ndarray:
    return np.asarray(arr, dtype=np.uint8)


def _voxel_downsample(points: np.ndarray, colors: np.ndarray, voxel: float) -> Tuple[np.ndarray, np.ndarray]:
    if points.shape[0] == 0:
        return points, colors
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
    if colors.size:
        cloud.colors = o3d.utility.Vector3dVector(colors)
    down = cloud.voxel_down_sample(voxel)
    pts = np.asarray(down.points)
    cols = np.asarray(down.colors) if down.has_colors() else np.empty((0, 3), dtype=np.float32)
    return pts, cols


def _crop_to_flame(points: np.ndarray,
                   colors: np.ndarray,
                   flame_vertices: np.ndarray,
                   max_dist_m: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if points.shape[0] == 0 or flame_vertices.shape[0] == 0:
        return points, colors, np.zeros((0,), dtype=np.float32)
    flame_pc = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(flame_vertices))
    kdtree = o3d.geometry.KDTreeFlann(flame_pc)
    distances = np.zeros(points.shape[0], dtype=np.float32)
    for i, pt in enumerate(points):
        _, idx, _ = kdtree.search_knn_vector_3d(pt, 1)
        nearest = flame_vertices[idx[0]]
        distances[i] = float(np.linalg.norm(pt - nearest))
    mask = distances <= max_dist_m
    if mask.mean() < 0.2:
        return points, colors, distances
    return points[mask], colors[mask], distances[mask]


def _binding_map(points: np.ndarray,
                 flame_vertices: np.ndarray,
                 k: int,
                 eps: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if points.shape[0] == 0 or flame_vertices.shape[0] == 0:
        return (
            np.zeros((0, k), dtype=np.uint32),
            np.zeros((0, k), dtype=np.float32),
            np.zeros((0, 3), dtype=np.float32),
        )
    flame_pc = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(flame_vertices))
    kdtree = o3d.geometry.KDTreeFlann(flame_pc)
    indices = np.zeros((points.shape[0], k), dtype=np.uint32)
    weights = np.zeros((points.shape[0], k), dtype=np.float32)
    for i, pt in enumerate(points):
        _, idx, _ = kdtree.search_knn_vector_3d(pt, k)
        idx = idx + [idx[-1]] * (k - len(idx))
        v = flame_vertices[idx]
        d = np.linalg.norm(v - pt, axis=1)
        w = 1.0 / (d + eps)
        w /= w.sum() if w.sum() > 0 else 1.0
        indices[i] = np.asarray(idx, dtype=np.uint32)
        weights[i] = w.astype(np.float32)
    blended = np.sum(flame_vertices[indices] * weights[:, :, None], axis=1)
    offsets = points - blended
    return indices, weights, offsets.astype(np.float32)


def build_overlay_pack(point_cloud: o3d.geometry.PointCloud,
                       flame_mesh: o3d.geometry.TriangleMesh,
                       config: OverlayConfig) -> OverlayPack:
    points = _as_float32(np.asarray(point_cloud.points))
    colors = np.asarray(point_cloud.colors)
    if colors.size:
        if colors.max() > 1.0:
            colors = colors / 255.0
        colors = _as_float32(colors)
    else:
        colors = np.zeros((points.shape[0], 3), dtype=np.float32)

    flame_vertices = _as_float32(np.asarray(flame_mesh.vertices))
    points, colors, distances = _crop_to_flame(points, colors, flame_vertices, config.max_dist_m)
    points, colors = _voxel_downsample(points, colors, config.voxel_size)

    if points.shape[0] > config.max_points:
        idx = np.random.default_rng(42).choice(points.shape[0], config.max_points, replace=False)
        points = points[idx]
        colors = colors[idx]
    if points.shape[0] < config.min_points:
        meta = {
            "enabled": False,
            "reason": "not_enough_points",
            "count": int(points.shape[0]),
            "version": config.version,
        }
        return OverlayPack(points, colors, np.zeros((0, config.knn_k), dtype=np.uint32),
                           np.zeros((0, config.knn_k), dtype=np.float32),
                           np.zeros((0, 3), dtype=np.float32),
                           meta)

    indices, weights, offsets = _binding_map(points, flame_vertices, config.knn_k, config.epsilon)
    bbox_min = points.min(axis=0)
    bbox_max = points.max(axis=0)
    meta = {
        "enabled": True,
        "count": int(points.shape[0]),
        "knn_k": int(config.knn_k),
        "bbox": [bbox_min.tolist(), bbox_max.tolist()],
        "version": config.version,
        "max_dist_m": config.max_dist_m,
        "voxel_size": config.voxel_size,
    }
    return OverlayPack(points, colors, indices, weights, offsets, meta)


def write_overlay_pack(scan_dir: str, scan_id: str, pack: OverlayPack) -> dict:
    os.makedirs(scan_dir, exist_ok=True)
    base = os.path.join(scan_dir, scan_id)
    points_path = f"{base}_overlay_points.bin"
    colors_path = f"{base}_overlay_colors.bin"
    indices_path = f"{base}_overlay_indices.bin"
    weights_path = f"{base}_overlay_weights.bin"
    offsets_path = f"{base}_overlay_offsets.bin"
    meta_path = f"{base}_overlay_meta.json"

    pack.points.astype(np.float32).tofile(points_path)
    colors_uint8 = np.clip(pack.colors * 255.0, 0, 255).astype(np.uint8)
    colors_uint8.tofile(colors_path)
    pack.indices.astype(np.uint32).tofile(indices_path)
    pack.weights.astype(np.float32).tofile(weights_path)
    pack.offsets.astype(np.float32).tofile(offsets_path)

    meta = pack.meta.copy()
    meta.update({
        "points_bin": os.path.basename(points_path),
        "colors_bin": os.path.basename(colors_path),
        "indices_bin": os.path.basename(indices_path),
        "weights_bin": os.path.basename(weights_path),
        "offsets_bin": os.path.basename(offsets_path),
        "points_dtype": "float32",
        "colors_dtype": "uint8",
        "indices_dtype": "uint32",
        "weights_dtype": "float32",
        "offsets_dtype": "float32",
    })
    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump(meta, handle)
    return meta
