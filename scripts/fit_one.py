import argparse
import json
import os

import numpy as np
import open3d as o3d

from backend.flame_fit import fit_flame_mesh
from backend.fit_types import FitConfig
from backend.metrics import landmark_rms_mm, nose_error_p95_mm, surface_error_metrics
from backend.units import normalize_units
from backend.main import mesh_to_glb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ply_path")
    parser.add_argument("--out", default="output.glb")
    parser.add_argument("--diagnostics", default="fit_diagnostics.json")
    args = parser.parse_args()

    if not os.path.exists(args.ply_path):
        raise SystemExit("PLY file not found.")

    point_cloud = o3d.io.read_point_cloud(args.ply_path)
    unit_result = normalize_units(point_cloud)
    processed = point_cloud
    processed.estimate_normals()

    fit_config = FitConfig()
    mesh, landmarks, stage_results, _, _ = fit_flame_mesh(
        processed,
        flame_model_path="backend/assets/flame/flame2023_Open.pkl",
        mediapipe_embedding_path="backend/assets/flame/mediapipe_landmark_embedding.npz",
        fit_config=fit_config,
        freeze_expression=False,
    )

    glb_bytes = mesh_to_glb(mesh)
    with open(args.out, "wb") as handle:
        handle.write(glb_bytes)

    mesh_vertices = np.asarray(mesh.vertices)
    cloud_points = np.asarray(processed.points)
    metrics = surface_error_metrics(mesh_vertices, cloud_points)
    metrics["nose_p95_mm"] = nose_error_p95_mm(landmarks, cloud_points)
    metrics["landmark_rms_mm"] = landmark_rms_mm(landmarks, cloud_points)
    metrics["units_inferred"] = unit_result.units_inferred
    metrics["unit_scale_applied"] = unit_result.unit_scale_applied

    payload = {
        "metrics": metrics,
        "stages": [stage.model_dump() for stage in stage_results],
    }
    with open(args.diagnostics, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


if __name__ == "__main__":
    main()
