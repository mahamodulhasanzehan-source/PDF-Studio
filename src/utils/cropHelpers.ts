export interface AspectPreset {
  id: string;
  name: string;
  ratio: number;
  label: string;
  type: 'paper' | 'standard';
}

export const ASPECT_PRESETS: AspectPreset[] = [
  // Paper sizes (ISO & US)
  { id: 'a4-portrait', name: 'A4', ratio: 210 / 297, label: 'A4', type: 'paper' },
  { id: 'a4-landscape', name: 'A4', ratio: 297 / 210, label: 'A4 Landscape', type: 'paper' },
  { id: 'letter-portrait', name: 'Letter', ratio: 8.5 / 11, label: 'Letter', type: 'paper' },
  { id: 'letter-landscape', name: 'Letter', ratio: 11 / 8.5, label: 'Letter Landscape', type: 'paper' },
  { id: 'legal-portrait', name: 'Legal', ratio: 8.5 / 14, label: 'Legal', type: 'paper' },
  { id: 'legal-landscape', name: 'Legal', ratio: 14 / 8.5, label: 'Legal Landscape', type: 'paper' },
  // Common standard ratios
  { id: '1:1', name: '1:1', ratio: 1.0, label: '1:1', type: 'standard' },
  { id: '4:3', name: '4:3', ratio: 4 / 3, label: '4:3', type: 'standard' },
  { id: '3:4', name: '3:4', ratio: 3 / 4, label: '3:4', type: 'standard' },
  { id: '16:9', name: '16:9', ratio: 16 / 9, label: '16:9', type: 'standard' },
  { id: '9:16', name: '9:16', ratio: 9 / 16, label: '9:16', type: 'standard' },
  { id: '3:2', name: '3:2', ratio: 3 / 2, label: '3:2', type: 'standard' },
  { id: '2:3', name: '2:3', ratio: 2 / 3, label: '2:3', type: 'standard' },
];

export interface AspectRatioResult {
  ratio: number;
  displayLabel: string;
  matchedPreset: AspectPreset | null;
}

export function getAspectRatioInfo(widthPx: number, heightPx: number): AspectRatioResult {
  if (widthPx <= 0 || heightPx <= 0) {
    return { ratio: 1, displayLabel: '1:1', matchedPreset: null };
  }

  const ratio = widthPx / heightPx;

  // Check if closely matches a preset (within 0.8% threshold for 40% sensitivity)
  let bestPreset: AspectPreset | null = null;
  let minDiff = 0.008;

  for (const preset of ASPECT_PRESETS) {
    const diff = Math.abs(ratio - preset.ratio) / preset.ratio;
    if (diff < minDiff) {
      minDiff = diff;
      bestPreset = preset;
    }
  }

  if (bestPreset) {
    return {
      ratio,
      displayLabel: bestPreset.label,
      matchedPreset: bestPreset,
    };
  }

  // Format custom ratio cleanly
  let displayLabel: string;
  if (ratio >= 1) {
    const rounded = Number(ratio.toFixed(2));
    displayLabel = `${rounded}:1`;
  } else {
    const invRounded = Number((1 / ratio).toFixed(2));
    displayLabel = `1:${invRounded}`;
  }

  return { ratio, displayLabel, matchedPreset: null };
}

export interface SnapResult {
  x: number;
  y: number;
  width: number;
  height: number;
  snappedPreset: AspectPreset | null;
}

export function snapCropBox(
  handle: string,
  candidate: { x: number; y: number; width: number; height: number },
  initialCrop: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number,
  thresholdPx = 5
): SnapResult {
  const minDim = 0.05;
  let { x, y, width, height } = candidate;

  if (handle === 'move' || pageWidth <= 0 || pageHeight <= 0) {
    return { x, y, width, height, snappedPreset: null };
  }

  const currentW = width * pageWidth;
  const currentH = height * pageHeight;

  let bestPreset: AspectPreset | null = null;
  let smallestDistancePx = thresholdPx + 1;
  let snappedCandidate: { x: number; y: number; width: number; height: number } | null = null;

  for (const preset of ASPECT_PRESETS) {
    const targetRatio = preset.ratio;

    if (handle === 'right') {
      const idealW = currentH * targetRatio;
      const dist = Math.abs(currentW - idealW);
      if (dist < smallestDistancePx) {
        const normW = idealW / pageWidth;
        if (normW >= minDim && x + normW <= 1.001) {
          smallestDistancePx = dist;
          bestPreset = preset;
          snappedCandidate = { x, y, width: Math.min(1 - x, normW), height };
        }
      }
    } else if (handle === 'left') {
      const rightEdge = initialCrop.x + initialCrop.width;
      const idealW = currentH * targetRatio;
      const dist = Math.abs(currentW - idealW);
      if (dist < smallestDistancePx) {
        const normW = idealW / pageWidth;
        const newX = rightEdge - normW;
        if (normW >= minDim && newX >= -0.001) {
          smallestDistancePx = dist;
          bestPreset = preset;
          snappedCandidate = { x: Math.max(0, newX), y, width: normW, height };
        }
      }
    } else if (handle === 'bottom') {
      const idealH = currentW / targetRatio;
      const dist = Math.abs(currentH - idealH);
      if (dist < smallestDistancePx) {
        const normH = idealH / pageHeight;
        if (normH >= minDim && y + normH <= 1.001) {
          smallestDistancePx = dist;
          bestPreset = preset;
          snappedCandidate = { x, y, width, height: Math.min(1 - y, normH) };
        }
      }
    } else if (handle === 'top') {
      const bottomEdge = initialCrop.y + initialCrop.height;
      const idealH = currentW / targetRatio;
      const dist = Math.abs(currentH - idealH);
      if (dist < smallestDistancePx) {
        const normH = idealH / pageHeight;
        const newY = bottomEdge - normH;
        if (normH >= minDim && newY >= -0.001) {
          smallestDistancePx = dist;
          bestPreset = preset;
          snappedCandidate = { x, y: Math.max(0, newY), width, height: normH };
        }
      }
    } else if (
      handle === 'bottom-right' ||
      handle === 'bottom-left' ||
      handle === 'top-right' ||
      handle === 'top-left'
    ) {
      // For corners, check snapping width or height
      const idealW = currentH * targetRatio;
      const distW = Math.abs(currentW - idealW);
      const idealH = currentW / targetRatio;
      const distH = Math.abs(currentH - idealH);

      const minDist = Math.min(distW, distH);
      if (minDist < smallestDistancePx) {
        if (distW <= distH) {
          const normW = idealW / pageWidth;
          if (normW >= minDim) {
            if (handle === 'bottom-right' || handle === 'top-right') {
              if (x + normW <= 1.001) {
                smallestDistancePx = distW;
                bestPreset = preset;
                snappedCandidate = { x, y, width: Math.min(1 - x, normW), height };
              }
            } else {
              const rightEdge = initialCrop.x + initialCrop.width;
              const newX = rightEdge - normW;
              if (newX >= -0.001) {
                smallestDistancePx = distW;
                bestPreset = preset;
                snappedCandidate = { x: Math.max(0, newX), y, width: normW, height };
              }
            }
          }
        } else {
          const normH = idealH / pageHeight;
          if (normH >= minDim) {
            if (handle === 'bottom-right' || handle === 'bottom-left') {
              if (y + normH <= 1.001) {
                smallestDistancePx = distH;
                bestPreset = preset;
                snappedCandidate = { x, y, width, height: Math.min(1 - y, normH) };
              }
            } else {
              const bottomEdge = initialCrop.y + initialCrop.height;
              const newY = bottomEdge - normH;
              if (newY >= -0.001) {
                smallestDistancePx = distH;
                bestPreset = preset;
                snappedCandidate = { x, y: Math.max(0, newY), width, height: normH };
              }
            }
          }
        }
      }
    }
  }

  if (bestPreset && snappedCandidate) {
    return {
      x: snappedCandidate.x,
      y: snappedCandidate.y,
      width: snappedCandidate.width,
      height: snappedCandidate.height,
      snappedPreset: bestPreset,
    };
  }

  return { x, y, width, height, snappedPreset: null };
}

/**
 * Rotates a normalized [0, 1] crop box by 90 degrees clockwise.
 * Keeps the exact same content cropped out when the page orientation changes.
 */
export function rotateCropBoxClockwise(crop: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const newX = 1 - (crop.y + crop.height);
  const newY = crop.x;
  const newWidth = crop.height;
  const newHeight = crop.width;
  return {
    x: Math.max(0, Math.min(1, Number(newX.toFixed(4)))),
    y: Math.max(0, Math.min(1, Number(newY.toFixed(4)))),
    width: Math.max(0.01, Math.min(1, Number(newWidth.toFixed(4)))),
    height: Math.max(0.01, Math.min(1, Number(newHeight.toFixed(4)))),
  };
}

