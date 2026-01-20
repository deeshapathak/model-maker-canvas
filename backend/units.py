from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
import open3d as o3d


@dataclass
class UnitResult:
    point_cloud: o3d.geometry.PointCloud
    units_inferred: str
    unit_scale_applied: float
    warnings: list[str]


def normalize_units(
    point_cloud: o3d.geometry.PointCloud,
    override_scale: Optional[float] = None,
    override_units: Optional[str] = None,
) -> UnitResult:
    points = np.asarray(point_cloud.points)
    warnings: list[str] = []
    if points.size == 0:
        return UnitResult(point_cloud, "unknown", 1.0, ["POINTCLOUD_EMPTY"])

    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    extent = maxs - mins
    diag = float(np.linalg.norm(extent))

    if override_scale is not None and override_scale > 0:
        scale = override_scale
        units_inferred = "override"
    elif override_units in {"meters", "millimeters"}:
        units_inferred = override_units
        scale = 0.001 if override_units == "millimeters" else 1.0
    # Heuristic: face-sized scan diag ~0.15-0.35 meters.
    elif diag > 1.0:
        units_inferred = "millimeters"
        scale = 0.001
    elif diag < 0.02:
        units_inferred = "unknown"
        scale = 1.0
        warnings.append("UNIT_SUSPECT")
    else:
        units_inferred = "meters"
        scale = 1.0

    if scale != 1.0:
        scaled = o3d.geometry.PointCloud()
        scaled.points = o3d.utility.Vector3dVector(points * scale)
        if point_cloud.has_colors():
            scaled.colors = point_cloud.colors
        point_cloud = scaled

    return UnitResult(point_cloud, units_inferred, scale, warnings)
