export interface OverlayMeta {
  enabled: boolean;
  count?: number;
  knn_k?: number;
  version?: string;
  points_bin?: string;
  colors_bin?: string;
  indices_bin?: string;
  weights_bin?: string;
  offsets_bin?: string;
  points_dtype?: string;
  colors_dtype?: string;
  indices_dtype?: string;
  weights_dtype?: string;
  offsets_dtype?: string;
  urls?: {
    points: string;
    colors: string;
    indices: string;
    weights: string;
    offsets: string;
  };
  reason?: string;
}

export interface OverlayPack {
  meta: OverlayMeta;
  points: Float32Array;
  colors: Uint8Array;
  indices: Uint32Array;
  weights: Float32Array;
  offsets: Float32Array;
}
