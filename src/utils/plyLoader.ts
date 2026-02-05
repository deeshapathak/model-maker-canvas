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

  // Parse header and record property names
  let vertexCount = 0;
  let headerEndIndex = 0;
  const propertyNames: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    const line = rawLine.toLowerCase();
    if (line.startsWith('element vertex')) {
      vertexCount = parseInt(rawLine.split(/\s+/)[2], 10);
    } else if (line.startsWith('property')) {
      const tokens = rawLine.split(/\s+/);
      const propName = tokens[tokens.length - 1];
      propertyNames.push(propName);
    }
    if (line === 'end_header') {
      headerEndIndex = i + 1;
      break;
    }
  }

  if (vertexCount === 0) {
    throw new Error('Invalid PLY: no vertices found');
  }

  // Determine property indices and color availability
  const xIdx = propertyNames.indexOf('x');
  const yIdx = propertyNames.indexOf('y');
  const zIdx = propertyNames.indexOf('z');
  const rIdx = propertyNames.indexOf('red');
  const gIdx = propertyNames.indexOf('green');
  const bIdx = propertyNames.indexOf('blue');
  const hasColors = rIdx !== -1 && gIdx !== -1 && bIdx !== -1;

  if (xIdx < 0 || yIdx < 0 || zIdx < 0) {
    throw new Error('Invalid PLY: missing x, y, or z property');
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

    const x = parseFloat(parts[xIdx]);
    const y = parseFloat(parts[yIdx]);
    const z = parseFloat(parts[zIdx]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    positions[validCount * 3] = x;
    positions[validCount * 3 + 1] = y;
    positions[validCount * 3 + 2] = z;

    if (hasColors) {
      colors[validCount * 3] = parseInt(parts[rIdx], 10) || 200;
      colors[validCount * 3 + 1] = parseInt(parts[gIdx], 10) || 180;
      colors[validCount * 3 + 2] = parseInt(parts[bIdx], 10) || 160;
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
