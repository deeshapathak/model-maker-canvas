from __future__ import annotations

import os
import tempfile
from typing import Optional

import numpy as np
import open3d as o3d
import trimesh
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

app = FastAPI(title="Model Maker Canvas Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_point_cloud_from_ply(data: bytes) -> o3d.geometry.PointCloud:
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")

    header = data[:64].lstrip().lower()
    if not header.startswith(b"ply"):
        raise HTTPException(status_code=400, detail="File is not a valid PLY.")

    tmp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".ply", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        point_cloud = o3d.io.read_point_cloud(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

    if point_cloud.is_empty():
        raise HTTPException(status_code=400, detail="Point cloud is empty.")

    return point_cloud


def preprocess_point_cloud(
    point_cloud: o3d.geometry.PointCloud,
    remove_outliers: bool,
) -> o3d.geometry.PointCloud:
    processed = point_cloud
    if remove_outliers:
        processed, _ = processed.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)

    if processed.is_empty():
        raise HTTPException(
            status_code=400,
            detail="Point cloud is empty after outlier removal.",
        )

    processed.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.02, max_nn=30)
    )
    processed.orient_normals_consistent_tangent_plane(30)
    return processed


def poisson_reconstruct(
    point_cloud: o3d.geometry.PointCloud,
    poisson_depth: int,
) -> o3d.geometry.TriangleMesh:
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        point_cloud, depth=poisson_depth
    )

    bbox = point_cloud.get_axis_aligned_bounding_box()
    mesh = mesh.crop(bbox)

    density_values = np.asarray(densities)
    if density_values.size == 0:
        raise HTTPException(status_code=500, detail="Poisson reconstruction failed.")

    density_threshold = float(np.quantile(density_values, 0.01))
    mesh.remove_vertices_by_mask(density_values < density_threshold)

    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_duplicated_vertices()
    mesh.remove_non_manifold_edges()

    if len(mesh.triangles) == 0:
        raise HTTPException(status_code=500, detail="Mesh reconstruction produced no faces.")

    return mesh


def decimate_and_finalize(
    mesh: o3d.geometry.TriangleMesh, target_tris: int
) -> o3d.geometry.TriangleMesh:
    if target_tris > 0 and len(mesh.triangles) > target_tris:
        mesh = mesh.simplify_quadric_decimation(target_tris)

    mesh.compute_vertex_normals()
    return mesh


def mesh_to_glb(mesh: o3d.geometry.TriangleMesh) -> bytes:
    vertices = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.triangles)
    colors = np.asarray(mesh.vertex_colors)

    if colors.size:
        colors = (colors * 255).clip(0, 255).astype(np.uint8)
    else:
        colors = None

    tri_mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=colors,
        process=False,
    )
    return trimesh.exchange.gltf.export_glb(tri_mesh)


@app.post("/api/ply-to-glb")
async def ply_to_glb(
    ply: UploadFile = File(...),
    poisson_depth: int = Query(9, ge=4, le=12),
    target_tris: int = Query(60000, ge=1000, le=500000),
    remove_outliers: bool = Query(False),
) -> Response:
    try:
        raw_data = await ply.read()
        point_cloud = read_point_cloud_from_ply(raw_data)
        processed = preprocess_point_cloud(point_cloud, remove_outliers=remove_outliers)
        mesh = poisson_reconstruct(processed, poisson_depth=poisson_depth)
        mesh = decimate_and_finalize(mesh, target_tris=target_tris)
        glb_bytes = mesh_to_glb(mesh)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive error handling
        raise HTTPException(status_code=500, detail=f"Conversion failed: {exc}") from exc

    return Response(
        content=glb_bytes,
        media_type="model/gltf-binary",
        headers={"Content-Disposition": "attachment; filename=scan.glb"},
    )
