from __future__ import annotations

from .fit_types import FitConfig, QCResult


def build_qc(metrics: dict[str, float], config: FitConfig) -> QCResult:
    warnings: list[str] = []
    pass_fit = True

    if metrics["p95_mm"] > config.max_surface_mm_p95:
        warnings.append("HIGH_SURFACE_ERROR")
        pass_fit = False
    if metrics["nose_p95_mm"] > config.max_nose_mm_p95:
        warnings.append("HIGH_NOSE_ERROR")
        pass_fit = False
    if metrics["landmark_rms_mm"] > config.max_landmark_mm:
        warnings.append("LANDMARK_MISMATCH")
        pass_fit = False
    if metrics["outlier_ratio"] > 0.1:
        warnings.append("HIGH_OUTLIER_RATIO")

    confidence = 1.0
    confidence -= min(metrics["p95_mm"] / (config.max_surface_mm_p95 * 2), 0.5)
    confidence -= min(metrics["nose_p95_mm"] / (config.max_nose_mm_p95 * 2), 0.3)
    confidence -= min(metrics["landmark_rms_mm"] / (config.max_landmark_mm * 2), 0.2)
    confidence = max(0.0, min(1.0, confidence))

    return QCResult(pass_fit=pass_fit, confidence=confidence, warnings=warnings)
