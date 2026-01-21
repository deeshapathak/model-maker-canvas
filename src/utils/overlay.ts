import { OverlayMeta, OverlayPack } from "@/types/overlay";

const fetchBinary = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Failed to fetch ${url}`);
  }
  return response.arrayBuffer();
};

export const fetchOverlayPack = async (metaUrl: string): Promise<OverlayPack> => {
  const metaResponse = await fetch(metaUrl);
  if (!metaResponse.ok) {
    const detail = await metaResponse.text();
    throw new Error(detail || "Failed to fetch overlay meta.");
  }
  const meta = (await metaResponse.json()) as OverlayMeta;
  if (!meta.enabled || !meta.urls) {
    throw new Error(meta.reason || "Overlay disabled.");
  }
  const [pointsBuf, colorsBuf, indicesBuf, weightsBuf, offsetsBuf] = await Promise.all([
    fetchBinary(meta.urls.points),
    fetchBinary(meta.urls.colors),
    fetchBinary(meta.urls.indices),
    fetchBinary(meta.urls.weights),
    fetchBinary(meta.urls.offsets),
  ]);

  return {
    meta,
    points: new Float32Array(pointsBuf),
    colors: new Uint8Array(colorsBuf),
    indices: new Uint32Array(indicesBuf),
    weights: new Float32Array(weightsBuf),
    offsets: new Float32Array(offsetsBuf),
  };
};

export const updateOverlayPositions = (
  overlay: OverlayPack,
  flamePositions: Float32Array,
  outPositions: Float32Array
) => {
  const k = overlay.meta.knn_k || 4;
  const indices = overlay.indices;
  const weights = overlay.weights;
  const offsets = overlay.offsets;

  const pointCount = overlay.points.length / 3;
  for (let i = 0; i < pointCount; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    const base = i * k;
    for (let j = 0; j < k; j++) {
      const vIdx = indices[base + j];
      const w = weights[base + j];
      const vBase = vIdx * 3;
      x += flamePositions[vBase] * w;
      y += flamePositions[vBase + 1] * w;
      z += flamePositions[vBase + 2] * w;
    }
    const oBase = i * 3;
    outPositions[oBase] = x + offsets[oBase];
    outPositions[oBase + 1] = y + offsets[oBase + 1];
    outPositions[oBase + 2] = z + offsets[oBase + 2];
  }
};
