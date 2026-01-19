from __future__ import annotations

import numpy as np
from .fit_types import FitConfig
from .flame_fit import fit_flame_mesh


def repeatability_check(
    point_cloud,
    flame_model_path: str,
    mediapipe_embedding_path: str,
    config: FitConfig,
    runs: int = 3,
) -> dict[str, float]:
    nose_tip_idx = 1
    nose_positions = []
    for _ in range(runs):
        mesh, landmarks, _ = fit_flame_mesh(
            point_cloud,
            flame_model_path=flame_model_path,
            mediapipe_embedding_path=mediapipe_embedding_path,
            fit_config=config,
            max_seconds=20.0,
            max_iters=100,
        )
        nose_positions.append(landmarks[nose_tip_idx])

    nose_positions = np.asarray(nose_positions)
    std = np.std(nose_positions, axis=0)
    return {
        "nose_tip_std_mm": float(np.linalg.norm(std) * 1000.0),
    }
