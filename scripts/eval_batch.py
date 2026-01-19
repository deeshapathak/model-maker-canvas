import argparse
import csv
import os

import numpy as np
import open3d as o3d

from backend.fit_types import FitConfig
from backend.flame_fit import fit_flame_mesh
from backend.metrics import landmark_rms_mm, nose_error_p95_mm, surface_error_metrics
from backend.units import normalize_units


def run_one(ply_path: str, fit_config: FitConfig) -> dict[str, float]:
    point_cloud = o3d.io.read_point_cloud(ply_path)
    unit_result = normalize_units(point_cloud)
    point_cloud.estimate_normals()
    mesh, landmarks, _ = fit_flame_mesh(
        point_cloud,
        flame_model_path="backend/assets/flame/flame2023_Open.pkl",
        mediapipe_embedding_path="backend/assets/flame/mediapipe_landmark_embedding.npz",
        fit_config=fit_config,
    )
    mesh_vertices = np.asarray(mesh.vertices)
    cloud_points = np.asarray(point_cloud.points)
    metrics = surface_error_metrics(mesh_vertices, cloud_points)
    metrics["nose_p95_mm"] = nose_error_p95_mm(landmarks, cloud_points)
    metrics["landmark_rms_mm"] = landmark_rms_mm(landmarks, cloud_points)
    metrics["units_inferred"] = unit_result.units_inferred
    metrics["unit_scale_applied"] = unit_result.unit_scale_applied
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ply_dir")
    parser.add_argument("--out", default="fit_metrics.csv")
    args = parser.parse_args()

    if not os.path.isdir(args.ply_dir):
        raise SystemExit("PLY directory not found.")

    fit_config = FitConfig()
    rows = []
    for filename in os.listdir(args.ply_dir):
        if not filename.lower().endswith(".ply"):
            continue
        ply_path = os.path.join(args.ply_dir, filename)
        metrics = run_one(ply_path, fit_config)
        metrics["file"] = filename
        rows.append(metrics)

    if not rows:
        raise SystemExit("No PLY files found.")

    fieldnames = ["file", "mean_mm", "median_mm", "p95_mm", "nose_p95_mm", "landmark_rms_mm", "outlier_ratio", "units_inferred", "unit_scale_applied"]
    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    p95_vals = [row["p95_mm"] for row in rows]
    print(f"Processed {len(rows)} scans. Mean p95: {sum(p95_vals) / len(p95_vals):.2f}mm")


if __name__ == "__main__":
    main()
