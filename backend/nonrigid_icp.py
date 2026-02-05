"""
Non-Rigid ICP for deforming FLAME template to match scan geometry exactly.

This module provides algorithms to deform a template mesh (FLAME) to precisely
match a target point cloud while preserving mesh topology and enabling morphability.

The key insight is:
1. FLAME provides clean topology and semantic structure
2. Non-rigid ICP deforms FLAME vertices to match exact scan geometry
3. Displacement vectors (deformed - base) enable morphing later
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
import open3d as o3d
from scipy import sparse
from scipy.sparse.linalg import spsolve

logger = logging.getLogger(__name__)


@dataclass
class NonRigidICPConfig:
    """Configuration for non-rigid ICP deformation."""
    # Number of iterations
    max_iterations: int = 50

    # Stiffness weight (higher = more rigid, preserves shape)
    # Lower values allow more flexibility to match scan
    stiffness: float = 10.0

    # Landmark weight (higher = landmarks more important)
    landmark_weight: float = 100.0

    # Convergence threshold (RMS change in vertex positions)
    convergence_threshold: float = 1e-5

    # Maximum correspondence distance (ignore points farther than this)
    max_correspondence_distance: float = 0.02  # 20mm

    # Use point-to-plane ICP for initial rigid alignment
    use_point_to_plane: bool = True

    # Number of neighbors for Laplacian smoothness
    laplacian_neighbors: int = 8


@dataclass
class NonRigidICPResult:
    """Result of non-rigid ICP deformation."""
    # Deformed vertex positions (same topology as input template)
    deformed_vertices: np.ndarray  # (V, 3)

    # Displacement vectors from original template
    displacements: np.ndarray  # (V, 3)

    # Per-vertex fitting error (distance to nearest scan point)
    vertex_errors: np.ndarray  # (V,)

    # Overall metrics
    mean_error: float
    max_error: float
    p95_error: float

    # Number of iterations used
    iterations_used: int

    # Did it converge?
    converged: bool


def build_laplacian_matrix(
    vertices: np.ndarray,
    faces: np.ndarray,
    num_neighbors: int = 8
) -> sparse.csr_matrix:
    """
    Build a graph Laplacian matrix for mesh smoothness regularization.

    The Laplacian encodes local geometry: L * V should be zero for a smooth mesh.
    Using this in optimization encourages deformations to be locally smooth.

    Args:
        vertices: (V, 3) vertex positions
        faces: (F, 3) face indices
        num_neighbors: Number of neighbors for Laplacian computation

    Returns:
        Sparse Laplacian matrix (V, V)
    """
    n_verts = len(vertices)

    # Build adjacency from faces
    adjacency = {}
    for face in faces:
        for i in range(3):
            v1, v2 = face[i], face[(i + 1) % 3]
            if v1 not in adjacency:
                adjacency[v1] = set()
            if v2 not in adjacency:
                adjacency[v2] = set()
            adjacency[v1].add(v2)
            adjacency[v2].add(v1)

    # Build sparse Laplacian
    rows, cols, data = [], [], []

    for i in range(n_verts):
        neighbors = list(adjacency.get(i, []))
        n_neighbors = len(neighbors)

        if n_neighbors > 0:
            # Diagonal: sum of weights (uniform weights = n_neighbors)
            rows.append(i)
            cols.append(i)
            data.append(float(n_neighbors))

            # Off-diagonal: -1 for each neighbor
            for j in neighbors:
                rows.append(i)
                cols.append(j)
                data.append(-1.0)

    L = sparse.csr_matrix((data, (rows, cols)), shape=(n_verts, n_verts))
    return L


def find_correspondences(
    source_vertices: np.ndarray,
    target_cloud: o3d.geometry.PointCloud,
    max_distance: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Find closest points on target cloud for each source vertex.

    Args:
        source_vertices: (V, 3) source mesh vertices
        target_cloud: Target point cloud
        max_distance: Maximum correspondence distance

    Returns:
        Tuple of (target_points, distances, valid_mask)
        - target_points: (V, 3) closest points on target
        - distances: (V,) distances to closest points
        - valid_mask: (V,) boolean mask for valid correspondences
    """
    target_points = np.asarray(target_cloud.points)

    # Build KD-tree for fast nearest neighbor search
    kdtree = o3d.geometry.KDTreeFlann(target_cloud)

    n_verts = len(source_vertices)
    closest_points = np.zeros((n_verts, 3), dtype=np.float32)
    distances = np.zeros(n_verts, dtype=np.float32)
    valid_mask = np.zeros(n_verts, dtype=bool)

    for i, vertex in enumerate(source_vertices):
        [k, idx, dist_sq] = kdtree.search_knn_vector_3d(vertex, 1)
        if k > 0:
            dist = np.sqrt(dist_sq[0])
            if dist <= max_distance:
                closest_points[i] = target_points[idx[0]]
                distances[i] = dist
                valid_mask[i] = True
            else:
                closest_points[i] = vertex  # Keep original if too far
                distances[i] = dist
                valid_mask[i] = False
        else:
            closest_points[i] = vertex
            distances[i] = float('inf')
            valid_mask[i] = False

    return closest_points, distances, valid_mask


def rigid_align(
    source_mesh: o3d.geometry.TriangleMesh,
    target_cloud: o3d.geometry.PointCloud,
    use_point_to_plane: bool = True
) -> np.ndarray:
    """
    Perform rigid ICP alignment as initialization.

    Args:
        source_mesh: Source mesh to align
        target_cloud: Target point cloud
        use_point_to_plane: Use point-to-plane ICP (more accurate)

    Returns:
        4x4 transformation matrix
    """
    # Create point cloud from mesh vertices
    source_cloud = o3d.geometry.PointCloud()
    source_cloud.points = source_mesh.vertices

    # Estimate normals if needed
    if not source_cloud.has_normals():
        source_cloud.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.02, max_nn=30)
        )
    if not target_cloud.has_normals():
        target_cloud.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.02, max_nn=30)
        )

    # Perform ICP
    if use_point_to_plane:
        estimation = o3d.pipelines.registration.TransformationEstimationPointToPlane()
    else:
        estimation = o3d.pipelines.registration.TransformationEstimationPointToPoint()

    result = o3d.pipelines.registration.registration_icp(
        source_cloud,
        target_cloud,
        max_correspondence_distance=0.05,  # 50mm for initial alignment
        init=np.eye(4),
        estimation_method=estimation,
        criteria=o3d.pipelines.registration.ICPConvergenceCriteria(
            max_iteration=100
        )
    )

    return result.transformation


def deform_template_to_scan(
    template_mesh: o3d.geometry.TriangleMesh,
    target_cloud: o3d.geometry.PointCloud,
    landmark_pairs: Optional[list[tuple[int, np.ndarray]]] = None,
    config: Optional[NonRigidICPConfig] = None
) -> NonRigidICPResult:
    """
    Deform template mesh to match target point cloud using non-rigid ICP.

    This is the main function that:
    1. Rigidly aligns template to target
    2. Iteratively deforms template vertices to match target
    3. Uses Laplacian regularization for smoothness
    4. Enforces landmark constraints if provided

    Args:
        template_mesh: FLAME mesh (or any template with clean topology)
        target_cloud: Target point cloud from scan
        landmark_pairs: Optional list of (vertex_index, target_position) for landmarks
        config: Non-rigid ICP configuration

    Returns:
        NonRigidICPResult with deformed vertices and displacement vectors
    """
    config = config or NonRigidICPConfig()

    # Get mesh data
    vertices = np.asarray(template_mesh.vertices).copy()
    faces = np.asarray(template_mesh.triangles)
    n_verts = len(vertices)

    logger.info(f"Non-rigid ICP: {n_verts} vertices, {len(faces)} faces")
    logger.info(f"Target cloud: {len(target_cloud.points)} points")

    # Store original vertices for displacement calculation
    original_vertices = vertices.copy()

    # Step 1: Rigid alignment
    logger.info("Step 1: Rigid alignment...")
    transform = rigid_align(template_mesh, target_cloud, config.use_point_to_plane)

    # Apply rigid transform
    vertices_homo = np.hstack([vertices, np.ones((n_verts, 1))])
    vertices = (transform @ vertices_homo.T).T[:, :3]

    # Step 2: Build Laplacian for regularization
    logger.info("Step 2: Building Laplacian matrix...")
    L = build_laplacian_matrix(vertices, faces, config.laplacian_neighbors)

    # Step 3: Iterative non-rigid deformation
    logger.info(f"Step 3: Non-rigid deformation ({config.max_iterations} max iterations)...")

    converged = False
    iterations_used = 0

    for iteration in range(config.max_iterations):
        # Find correspondences
        target_points, distances, valid_mask = find_correspondences(
            vertices, target_cloud, config.max_correspondence_distance
        )

        n_valid = np.sum(valid_mask)
        mean_dist = np.mean(distances[valid_mask]) if n_valid > 0 else float('inf')

        if iteration % 10 == 0:
            logger.info(f"  Iteration {iteration}: {n_valid}/{n_verts} valid, mean dist = {mean_dist*1000:.2f}mm")

        # Build linear system: (W + alpha * L^T L) * V_new = W * P + alpha * L^T L * V_current
        # Where W is correspondence weights, P is target points, alpha is stiffness

        # Correspondence weights (diagonal matrix)
        weights = np.zeros(n_verts)
        weights[valid_mask] = 1.0
        W = sparse.diags(weights)

        # Stiffness term: alpha * L^T @ L
        LtL = L.T @ L
        alpha = config.stiffness

        # Landmark constraints (if provided)
        landmark_matrix = sparse.csr_matrix((n_verts, n_verts))
        landmark_rhs = np.zeros((n_verts, 3))

        if landmark_pairs:
            lm_rows, lm_cols, lm_data = [], [], []
            for vert_idx, target_pos in landmark_pairs:
                if 0 <= vert_idx < n_verts:
                    lm_rows.append(vert_idx)
                    lm_cols.append(vert_idx)
                    lm_data.append(config.landmark_weight)
                    landmark_rhs[vert_idx] = target_pos * config.landmark_weight

            if lm_rows:
                landmark_matrix = sparse.csr_matrix(
                    (lm_data, (lm_rows, lm_cols)),
                    shape=(n_verts, n_verts)
                )

        # Assemble system matrix
        A = W + alpha * LtL + landmark_matrix

        # Solve for each coordinate separately
        new_vertices = np.zeros_like(vertices)
        for dim in range(3):
            b = W @ target_points[:, dim] + alpha * (LtL @ vertices[:, dim]) + landmark_rhs[:, dim]
            new_vertices[:, dim] = spsolve(A.tocsr(), b)

        # Check convergence
        vertex_change = np.linalg.norm(new_vertices - vertices, axis=1)
        rms_change = np.sqrt(np.mean(vertex_change ** 2))

        vertices = new_vertices
        iterations_used = iteration + 1

        if rms_change < config.convergence_threshold:
            logger.info(f"  Converged at iteration {iteration} (RMS change = {rms_change:.6f})")
            converged = True
            break

    # Final correspondence check
    _, final_distances, final_valid = find_correspondences(
        vertices, target_cloud, config.max_correspondence_distance * 2  # Looser for final metrics
    )

    # Compute displacement vectors
    displacements = vertices - original_vertices

    # Compute metrics
    valid_errors = final_distances[final_valid]
    mean_error = np.mean(valid_errors) if len(valid_errors) > 0 else float('inf')
    max_error = np.max(valid_errors) if len(valid_errors) > 0 else float('inf')
    p95_error = np.percentile(valid_errors, 95) if len(valid_errors) > 0 else float('inf')

    logger.info(f"Non-rigid ICP complete:")
    logger.info(f"  Iterations: {iterations_used}, Converged: {converged}")
    logger.info(f"  Mean error: {mean_error*1000:.2f}mm, P95: {p95_error*1000:.2f}mm, Max: {max_error*1000:.2f}mm")
    logger.info(f"  Displacement range: [{np.min(displacements)*1000:.2f}, {np.max(displacements)*1000:.2f}]mm")

    return NonRigidICPResult(
        deformed_vertices=vertices.astype(np.float32),
        displacements=displacements.astype(np.float32),
        vertex_errors=final_distances.astype(np.float32),
        mean_error=float(mean_error),
        max_error=float(max_error),
        p95_error=float(p95_error),
        iterations_used=iterations_used,
        converged=converged
    )


def apply_displacements(
    base_vertices: np.ndarray,
    displacements: np.ndarray,
    blend: float = 1.0
) -> np.ndarray:
    """
    Apply displacement vectors to base vertices with optional blending.

    This is used for morphing: blend=0 gives base FLAME, blend=1 gives exact scan.

    Args:
        base_vertices: (V, 3) FLAME base vertices
        displacements: (V, 3) displacement vectors
        blend: Blend factor (0=base, 1=fully displaced)

    Returns:
        (V, 3) blended vertex positions
    """
    return base_vertices + blend * displacements


if __name__ == "__main__":
    # Simple test
    import sys
    logging.basicConfig(level=logging.INFO)

    # Create a simple test case
    print("Non-rigid ICP module loaded successfully")
    print(f"Config defaults: {NonRigidICPConfig()}")
