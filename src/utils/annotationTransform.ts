import {
  AnnotationsState,
  DrawingAnnotation,
  PageDimension,
  Point,
  ShapeAnnotation,
} from '../types/pdf';

function rotatePointCw(p: Point, oldH: number): Point {
  return {
    x: oldH - p.y,
    y: p.x,
  };
}

function rotateRectCw(
  x: number,
  y: number,
  w: number,
  h: number,
  oldH: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: oldH - (y + h),
    y: x,
    width: h,
    height: w,
  };
}

/**
 * Rotates all annotations on specified pages by 90 degrees clockwise
 * around each page's visual dimensions prior to rotation.
 */
export function rotateAnnotationsClockwise(
  annotations: AnnotationsState,
  targetPageNums: Set<number>,
  pageDimensions: Record<number, PageDimension>
): AnnotationsState {
  const getPageHeight = (pageNum: number) => pageDimensions[pageNum]?.height || 792;

  return {
    drawings: annotations.drawings.map((d) => {
      if (!targetPageNums.has(d.page)) return d;
      const oldH = getPageHeight(d.page);
      return {
        ...d,
        points: d.points.map((p) => rotatePointCw(p, oldH)),
      };
    }),
    shapes: (annotations.shapes || []).map((s) => {
      if (!targetPageNums.has(s.page)) return s;
      const oldH = getPageHeight(s.page);
      const p1 = rotatePointCw({ x: s.x1, y: s.y1 }, oldH);
      const p2 = rotatePointCw({ x: s.x2, y: s.y2 }, oldH);
      return {
        ...s,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      };
    }),
    textboxes: annotations.textboxes.map((t) => {
      if (!targetPageNums.has(t.page)) return t;
      const oldH = getPageHeight(t.page);
      const r = rotateRectCw(t.x, t.y, t.width, t.height, oldH);
      const maskRect = t.maskRect
        ? rotateRectCw(
            t.maskRect.x,
            t.maskRect.y,
            t.maskRect.width,
            t.maskRect.height,
            oldH
          )
        : undefined;
      return {
        ...t,
        x: Math.max(0, r.x),
        y: Math.max(0, r.y),
        width: r.width,
        height: r.height,
        maskRect,
      };
    }),
    redactions: annotations.redactions.map((r) => {
      if (!targetPageNums.has(r.page)) return r;
      const oldH = getPageHeight(r.page);
      const rect = rotateRectCw(r.x, r.y, r.width, r.height, oldH);
      const pts = r.points?.map((p) => rotatePointCw(p, oldH));
      return {
        ...r,
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: rect.width,
        height: rect.height,
        points: pts,
      };
    }),
    images: annotations.images.map((img) => {
      if (!targetPageNums.has(img.page)) return img;
      const oldH = getPageHeight(img.page);
      const cx = img.x + img.width / 2;
      const cy = img.y + img.height / 2;
      const newCenter = rotatePointCw({ x: cx, y: cy }, oldH);
      return {
        ...img,
        x: newCenter.x - img.width / 2,
        y: newCenter.y - img.height / 2,
        rotation: ((img.rotation || 0) + 90) % 360,
      };
    }),
  };
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export function hitTestDrawing(
  drawing: DrawingAnnotation,
  pt: Point,
  threshold = 8
): boolean {
  const effectiveThreshold = threshold + (drawing.strokeWidth || 2) / 2;
  const pts = drawing.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) {
    return Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) <= effectiveThreshold;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(pt, pts[i], pts[i + 1]) <= effectiveThreshold) {
      return true;
    }
  }
  return false;
}

export function hitTestShape(
  shape: ShapeAnnotation,
  pt: Point,
  threshold = 8
): boolean {
  const effectiveThreshold = threshold + (shape.strokeWidth || 2) / 2;
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    return (
      distToSegment(
        pt,
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 }
      ) <= effectiveThreshold
    );
  }
  const minX = Math.min(shape.x1, shape.x2);
  const maxX = Math.max(shape.x1, shape.x2);
  const minY = Math.min(shape.y1, shape.y2);
  const maxY = Math.max(shape.y1, shape.y2);

  if (shape.fillColor && shape.fillColor !== 'transparent') {
    return (
      pt.x >= minX - threshold &&
      pt.x <= maxX + threshold &&
      pt.y >= minY - threshold &&
      pt.y <= maxY + threshold
    );
  }

  if (shape.kind === 'rect') {
    const nearLeft =
      Math.abs(pt.x - minX) <= effectiveThreshold &&
      pt.y >= minY - effectiveThreshold &&
      pt.y <= maxY + effectiveThreshold;
    const nearRight =
      Math.abs(pt.x - maxX) <= effectiveThreshold &&
      pt.y >= minY - effectiveThreshold &&
      pt.y <= maxY + effectiveThreshold;
    const nearTop =
      Math.abs(pt.y - minY) <= effectiveThreshold &&
      pt.x >= minX - effectiveThreshold &&
      pt.x <= maxX + effectiveThreshold;
    const nearBottom =
      Math.abs(pt.y - maxY) <= effectiveThreshold &&
      pt.x >= minX - effectiveThreshold &&
      pt.x <= maxX + effectiveThreshold;
    return nearLeft || nearRight || nearTop || nearBottom;
  }

  // Ellipse perimeter distance approximation
  const rx = Math.max(1, (maxX - minX) / 2);
  const ry = Math.max(1, (maxY - minY) / 2);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const normDist = Math.hypot((pt.x - cx) / rx, (pt.y - cy) / ry);
  const avgR = (rx + ry) / 2;
  return Math.abs(normDist - 1) * avgR <= effectiveThreshold;
}
