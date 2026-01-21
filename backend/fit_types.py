from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class FitConfig(BaseModel):
    iters_pose: int = 80
    iters_expr: int = 120
    iters_shape: int = 160

    w_landmark: float = 2.0
    w_chamfer: float = 1.0
    w_point2plane: float = 0.5
    w_prior_shape: float = 0.005
    w_prior_expr: float = 0.005
    w_prior_jaw: float = 0.02

    huber_delta: float = 0.01

    w_nose_multiplier: float = 3.0
    nose_radius_mm: float = 30.0
    nose_kNN: Optional[int] = None
    w_mouth_multiplier: float = 2.5
    jaw_max_rad: float = 0.35

    trim_percentile: Optional[float] = 0.98

    max_landmark_mm: float = 4.0
    max_surface_mm_p95: float = 6.0
    max_nose_mm_p95: float = 4.0


class FlameParams(BaseModel):
    shape: List[float] = Field(default_factory=list)
    expression: List[float] = Field(default_factory=list)
    pose: List[float] = Field(default_factory=list)
    scale: float = 1.0
    translation: List[float] = Field(default_factory=list)


class StageResult(BaseModel):
    name: str
    loss: float
    duration_ms: float
    metrics_mm: Dict[str, float] = Field(default_factory=dict)


class QCResult(BaseModel):
    pass_fit: bool
    confidence: float
    warnings: List[str] = Field(default_factory=list)


class FitMetrics(BaseModel):
    mean_mm: float
    median_mm: float
    p95_mm: float
    nose_p95_mm: float
    landmark_rms_mm: float
    outlier_ratio: float
    repeatability_std_mm: Optional[Dict[str, float]] = None
    units_inferred: Optional[str] = None
    unit_scale_applied: Optional[float] = None
    nose_definition_version: Optional[str] = None


class FitResult(BaseModel):
    flame_params: FlameParams
    stage_results: List[StageResult] = Field(default_factory=list)
    metrics: FitMetrics
    qc: QCResult


class OverlayConfig(BaseModel):
    enabled: bool = True
    knn_k: int = 4
    max_dist_m: float = 0.05
    voxel_size: float = 0.004
    max_points: int = 80000
    min_points: int = 3000
    epsilon: float = 1e-6
    version: str = "v1"
