from __future__ import annotations

import argparse
import json
import os

import numpy as np
import open3d as o3d

from backend.fit_types import OverlayConfig
from backend.main import SCAN_DIR, read_point_cloud_from_path
from backend.overlay import build_overlay_pack, write_overlay_pack


def main() -> None:
    parser = argparse.ArgumentParser(description="Build overlay pack for a scan.")
    parser.add_argument("--scanId", dest="scan_id", help="Scan ID to load from SCAN_DIR.")
    parser.add_argument("--ply", dest="ply_path", help="Path to PLY file.")
    parser.add_argument("--mesh", dest="mesh_path", help="Path to FLAME mesh PLY/OBJ.")
    args = parser.parse_args()

    if not args.scan_id and not (args.ply_path and args.mesh_path):
        raise SystemExit("Provide --scanId or --ply + --mesh.")

    if args.scan_id:
        ply_path = os.path.join(SCAN_DIR, f"{args.scan_id}.ply")
        mesh_path = os.path.join(SCAN_DIR, f"{args.scan_id}.glb")
    else:
        ply_path = args.ply_path
        mesh_path = args.mesh_path

    point_cloud = read_point_cloud_from_path(ply_path)
    mesh = o3d.io.read_triangle_mesh(mesh_path)
    if len(mesh.triangles) == 0:
        raise SystemExit("Mesh has no triangles.")

    config = OverlayConfig()
    pack = build_overlay_pack(point_cloud, mesh, config)
    meta = write_overlay_pack(SCAN_DIR, args.scan_id or "overlay", pack)
    if pack.points.shape[0] > 0:
        weight_sums = pack.weights.sum(axis=1)
        offsets_norm = np.linalg.norm(pack.offsets, axis=1)
        print("overlay_points:", pack.points.shape[0])
        print("weights_sum_mean:", float(np.mean(weight_sums)))
        print("weights_sum_min:", float(np.min(weight_sums)))
        print("weights_sum_max:", float(np.max(weight_sums)))
        print("offset_norm_p95_m:", float(np.percentile(offsets_norm, 95)))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
