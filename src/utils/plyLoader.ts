/**
 * Simple PLY loader for ASCII format point clouds
 * Returns positions and colors as typed arrays for Three.js
 */

export interface PLYData {
  positions: Float32Array;
  colors: Uint8Array;
  pointCount: number;
}

export async function loadPLY(url: string): Promise<PLYData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load PLY: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n');

  // Parse header
  let vertexCount = 0;
  let headerEndIndex = 0;
  let hasColors = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();

    if (line.startsWith('element vertex')) {
      vertexCount = parseInt(line.split(' ')[2], 10);
    }
    if (line.includes('property') && (line.includes('red') || line.includes('green') || line.includes('blue'))) {
      hasColors = true;
    }
    if (line === 'end_header') {
      headerEndIndex = i + 1;
      break;
    }
  }

  if (vertexCount === 0) {
    throw new Error('Invalid PLY: no vertices found');
  }

  // Parse vertices
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Uint8Array(vertexCount * 3);

  let validCount = 0;
  for (let i = 0; i < vertexCount && (headerEndIndex + i) < lines.length; i++) {
    const line = lines[headerEndIndex + i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    positions[validCount * 3] = x;
    positions[validCount * 3 + 1] = y;
    positions[validCount * 3 + 2] = z;

    // Parse colors if present (format: x y z r g b)
    if (hasColors && parts.length >= 6) {
      colors[validCount * 3] = parseInt(parts[3], 10) || 200;
      colors[validCount * 3 + 1] = parseInt(parts[4], 10) || 180;
      colors[validCount * 3 + 2] = parseInt(parts[5], 10) || 160;
    } else {
      // Default skin-ish color
      colors[validCount * 3] = 220;
      colors[validCount * 3 + 1] = 190;
      colors[validCount * 3 + 2] = 170;
    }

    validCount++;
  }

  console.log(`PLY loaded: ${validCount} points from ${vertexCount} declared`);

  return {
    positions: positions.slice(0, validCount * 3),
    colors: colors.slice(0, validCount * 3),
    pointCount: validCount,
  };
}
