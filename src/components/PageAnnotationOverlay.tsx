import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from 'react';
import {
  ToolMode,
  ShapeKind,
  Point,
  DrawingAnnotation,
  ShapeAnnotation,
  TextBoxAnnotation,
  RedactionAnnotation,
  ImageAnnotation,
  ExtractedTextItem,
} from '../types/pdf';
import { RotateCw, Trash2, Move } from 'lucide-react';
import { hitTestDrawing, hitTestShape } from '../utils/annotationTransform';

interface PageAnnotationOverlayProps {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  toolMode: ToolMode;
  shapeKind: ShapeKind;
  shapeFillEnabled: boolean;
  shapeFillColor: string;
  drawings: DrawingAnnotation[];
  shapes: ShapeAnnotation[];
  textboxes: TextBoxAnnotation[];
  redactions: RedactionAnnotation[];
  images: ImageAnnotation[];
  extractedTexts: ExtractedTextItem[];
  selectedTextId: string | null;
  onSelectText: (id: string | null) => void;
  selectedRedactionId: string | null;
  onSelectRedaction: (id: string | null) => void;
  selectedImageId: string | null;
  onSelectImage: (id: string | null) => void;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null) => void;
  onAddDrawing: (drawing: DrawingAnnotation) => void;
  onDeleteDrawing: (id: string) => void;
  onAddShape: (shape: ShapeAnnotation) => void;
  onUpdateShape: (id: string, updated: Partial<ShapeAnnotation>) => void;
  onDeleteShape: (id: string) => void;
  onAddTextBox: (box: TextBoxAnnotation) => void;
  onUpdateTextBox: (id: string, updated: Partial<TextBoxAnnotation>) => void;
  onAddRedaction: (redaction: RedactionAnnotation) => void;
  onUpdateRedaction: (id: string, updated: Partial<RedactionAnnotation>) => void;
  onUpdateImage: (id: string, updated: Partial<ImageAnnotation>) => void;
  onDeleteImage: (id: string) => void;
  drawColor: string;
  strokeWidth: number;
  drawOpacity: number;
  redactColor: string;
  redactOpacity: number;
  textColor: string;
  onSampleColorAtPoint: (clientX: number, clientY: number) => void;
  onSampleBackgroundColor?: (pageX: number, pageY: number) => string;
  onCommitHistory?: (description: string) => void;
}

function renderShapeSvgElement(
  s: Pick<ShapeAnnotation, 'kind' | 'x1' | 'y1' | 'x2' | 'y2' | 'color' | 'fillColor' | 'strokeWidth' | 'opacity'>,
  isSelected: boolean,
  interactive: boolean,
  handlers?: {
    onClick?: (e: ReactMouseEvent) => void;
    onMouseDown?: (e: ReactMouseEvent) => void;
  }
) {
  const fill =
    s.fillColor && s.fillColor !== 'transparent' ? s.fillColor : 'none';
  const strokeW = s.strokeWidth || 2;
  const commonProps = {
    stroke: s.color,
    strokeWidth: strokeW,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    opacity: s.opacity,
    className: interactive
      ? 'cursor-pointer pointer-events-auto'
      : 'pointer-events-none',
    onClick: handlers?.onClick,
    onMouseDown: handlers?.onMouseDown,
  };

  if (s.kind === 'line' || s.kind === 'arrow') {
    const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const headLen = Math.max(8, strokeW * 3.5);
    const spread = Math.PI / 6;
    const ax1 = s.x2 - headLen * Math.cos(angle - spread);
    const ay1 = s.y2 - headLen * Math.sin(angle - spread);
    const ax2 = s.x2 - headLen * Math.cos(angle + spread);
    const ay2 = s.y2 - headLen * Math.sin(angle + spread);

    return (
      <g
        className={commonProps.className}
        onClick={handlers?.onClick}
        onMouseDown={handlers?.onMouseDown}
      >
        <line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="transparent"
          strokeWidth={Math.max(12, strokeW + 8)}
        />
        <line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={s.color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          opacity={s.opacity}
        />
        {s.kind === 'arrow' && (
          <path
            d={`M ${ax1} ${ay1} L ${s.x2} ${s.y2} L ${ax2} ${ay2}`}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.opacity}
          />
        )}
        {isSelected && (
          <>
            <circle cx={s.x1} cy={s.y1} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
            <circle cx={s.x2} cy={s.y2} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
          </>
        )}
      </g>
    );
  }

  const minX = Math.min(s.x1, s.x2);
  const minY = Math.min(s.y1, s.y2);
  const w = Math.abs(s.x2 - s.x1);
  const h = Math.abs(s.y2 - s.y1);

  if (s.kind === 'rect') {
    return (
      <g>
        <rect
          x={minX}
          y={minY}
          width={w}
          height={h}
          fill={fill}
          {...commonProps}
        />
        {isSelected && (
          <rect
            x={minX - 2}
            y={minY - 2}
            width={w + 4}
            height={h + 4}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            className="pointer-events-none"
          />
        )}
      </g>
    );
  }

  return (
    <g>
      <ellipse
        cx={minX + w / 2}
        cy={minY + h / 2}
        rx={Math.max(1, w / 2)}
        ry={Math.max(1, h / 2)}
        fill={fill}
        {...commonProps}
      />
      {isSelected && (
        <rect
          x={minX - 2}
          y={minY - 2}
          width={w + 4}
          height={h + 4}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          className="pointer-events-none"
        />
      )}
    </g>
  );
}

export default function PageAnnotationOverlay({
  pageNumber,
  width,
  height,
  scale,
  toolMode,
  shapeKind,
  shapeFillEnabled,
  shapeFillColor,
  drawings,
  shapes,
  textboxes,
  redactions,
  images,
  extractedTexts,
  selectedTextId,
  onSelectText,
  selectedRedactionId,
  onSelectRedaction,
  selectedImageId,
  onSelectImage,
  selectedShapeId,
  onSelectShape,
  selectedDrawingId,
  onSelectDrawing,
  onAddDrawing,
  onDeleteDrawing,
  onAddShape,
  onUpdateShape,
  onDeleteShape,
  onAddTextBox,
  onUpdateTextBox,
  onAddRedaction,
  onUpdateRedaction,
  onUpdateImage,
  onDeleteImage,
  drawColor,
  strokeWidth,
  drawOpacity,
  redactColor,
  redactOpacity,
  textColor,
  onSampleColorAtPoint,
  onSampleBackgroundColor,
  onCommitHistory,
}: PageAnnotationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const currentPointsRef = useRef<Point[]>([]);

  const [isCreatingRegion, setIsCreatingRegion] = useState(false);
  const [currentRegionPoints, setCurrentRegionPoints] = useState<Point[]>([]);
  const currentRegionPointsRef = useRef<Point[]>([]);

  const [isCreatingShape, setIsCreatingShape] = useState(false);
  const [draftShape, setDraftShape] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const draftShapeRef = useRef<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  const [isErasing, setIsErasing] = useState(false);

  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize' | 'rotate';
    target: 'text' | 'redaction' | 'image' | 'shape';
    id: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initW: number;
    initH: number;
    initRot?: number;
    handle?: string;
    initPoints?: Point[];
    initX2?: number;
    initY2?: number;
  } | null>(null);
  const didDragMoveRef = useRef(false);
  const textEditedRef = useRef(false);

  const getPagePoint = (e: ReactMouseEvent | MouseEvent): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const clearAllSelections = () => {
    onSelectText(null);
    onSelectRedaction(null);
    onSelectImage(null);
    onSelectShape(null);
    onSelectDrawing(null);
  };

  const eraseAtPoint = (pt: Point) => {
    const threshold = 8 / Math.max(0.4, scale);
    for (const d of drawings) {
      if (hitTestDrawing(d, pt, threshold)) {
        onDeleteDrawing(d.id);
      }
    }
    for (const s of shapes) {
      if (hitTestShape(s, pt, threshold)) {
        onDeleteShape(s.id);
      }
    }
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    if (toolMode === 'eyedropper') {
      onSampleColorAtPoint(e.clientX, e.clientY);
      return;
    }

    if (toolMode === 'hand') return;

    const pt = getPagePoint(e);

    if (toolMode === 'eraser') {
      setIsErasing(true);
      eraseAtPoint(pt);
      return;
    }

    if (toolMode === 'draw' || toolMode === 'highlighter') {
      currentPointsRef.current = [pt];
      setIsDrawing(true);
      setCurrentPoints([pt]);
      return;
    }

    if (toolMode === 'shape') {
      const start = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      draftShapeRef.current = start;
      setDraftShape(start);
      setIsCreatingShape(true);
      return;
    }

    if (toolMode === 'redact') {
      currentRegionPointsRef.current = [pt];
      setIsCreatingRegion(true);
      setCurrentRegionPoints([pt]);
      return;
    }

    if (toolMode === 'text') {
      const newBox: TextBoxAnnotation = {
        id: `text-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        page: pageNumber,
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        width: 180,
        height: 48,
        text: 'Type text here...',
        fontSize: 16,
        fontFamily: 'Helvetica',
        fontWeight: 'normal',
        color: textColor,
        textAlign: 'left',
        lineHeight: 1.2,
      };
      onAddTextBox(newBox);
      onSelectText(newBox.id);
      return;
    }

    clearAllSelections();
  };

  const latestPropsRef = useRef({
    scale,
    toolMode,
    shapeKind,
    shapeFillEnabled,
    shapeFillColor,
    drawColor,
    strokeWidth,
    drawOpacity,
    redactColor,
    redactOpacity,
    pageNumber,
    drawings,
    shapes,
    onAddDrawing,
    onDeleteDrawing,
    onAddShape,
    onUpdateShape,
    onDeleteShape,
    onSelectShape,
    onAddRedaction,
    onSelectRedaction,
    onUpdateTextBox,
    onUpdateRedaction,
    onUpdateImage,
    onCommitHistory,
  });
  latestPropsRef.current = {
    scale,
    toolMode,
    shapeKind,
    shapeFillEnabled,
    shapeFillColor,
    drawColor,
    strokeWidth,
    drawOpacity,
    redactColor,
    redactOpacity,
    pageNumber,
    drawings,
    shapes,
    onAddDrawing,
    onDeleteDrawing,
    onAddShape,
    onUpdateShape,
    onDeleteShape,
    onSelectShape,
    onAddRedaction,
    onSelectRedaction,
    onUpdateTextBox,
    onUpdateRedaction,
    onUpdateImage,
    onCommitHistory,
  };

  useEffect(() => {
    if (!isDrawing && !isCreatingRegion && !isCreatingShape && !isErasing && !dragState) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const props = latestPropsRef.current;

      if (isErasing && props.toolMode === 'eraser') {
        const pt = getPagePoint(e);
        const threshold = 8 / Math.max(0.4, props.scale);
        for (const d of props.drawings) {
          if (hitTestDrawing(d, pt, threshold)) {
            props.onDeleteDrawing(d.id);
          }
        }
        for (const s of props.shapes) {
          if (hitTestShape(s, pt, threshold)) {
            props.onDeleteShape(s.id);
          }
        }
        return;
      }

      if (isDrawing && (props.toolMode === 'draw' || props.toolMode === 'highlighter')) {
        const pt = getPagePoint(e);
        const nextPts = [...currentPointsRef.current, pt];
        currentPointsRef.current = nextPts;
        setCurrentPoints(nextPts);
        return;
      }

      if (isCreatingShape && props.toolMode === 'shape' && draftShapeRef.current) {
        const pt = getPagePoint(e);
        let x2 = pt.x;
        let y2 = pt.y;
        if (e.shiftKey) {
          const dx = x2 - draftShapeRef.current.x1;
          const dy = y2 - draftShapeRef.current.y1;
          if (props.shapeKind === 'line' || props.shapeKind === 'arrow') {
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(dx, dy);
            x2 = draftShapeRef.current.x1 + len * Math.cos(angle);
            y2 = draftShapeRef.current.y1 + len * Math.sin(angle);
          } else {
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            x2 = draftShapeRef.current.x1 + Math.sign(dx || 1) * side;
            y2 = draftShapeRef.current.y1 + Math.sign(dy || 1) * side;
          }
        }
        const updated = { ...draftShapeRef.current, x2, y2 };
        draftShapeRef.current = updated;
        setDraftShape(updated);
        return;
      }

      if (isCreatingRegion && props.toolMode === 'redact') {
        const pt = getPagePoint(e);
        const pts = currentRegionPointsRef.current;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 2) {
          const nextPts = [...pts, pt];
          currentRegionPointsRef.current = nextPts;
          setCurrentRegionPoints(nextPts);
        }
        return;
      }

      if (dragState) {
        didDragMoveRef.current = true;
        const dx = (e.clientX - dragState.startX) / props.scale;
        const dy = (e.clientY - dragState.startY) / props.scale;

        if (dragState.type === 'move') {
          if (dragState.target === 'shape' && dragState.initX2 !== undefined && dragState.initY2 !== undefined) {
            props.onUpdateShape(dragState.id, {
              x1: dragState.initX + dx,
              y1: dragState.initY + dy,
              x2: dragState.initX2 + dx,
              y2: dragState.initY2 + dy,
            });
            return;
          }

          const newX = Math.max(0, dragState.initX + dx);
          const newY = Math.max(0, dragState.initY + dy);
          const actualDx = newX - dragState.initX;
          const actualDy = newY - dragState.initY;

          if (dragState.target === 'text') {
            props.onUpdateTextBox(dragState.id, { x: newX, y: newY });
          } else if (dragState.target === 'redaction') {
            if (dragState.initPoints && dragState.initPoints.length > 0) {
              const shifted = dragState.initPoints.map((p) => ({
                x: p.x + actualDx,
                y: p.y + actualDy,
              }));
              props.onUpdateRedaction(dragState.id, { x: newX, y: newY, points: shifted });
            } else {
              props.onUpdateRedaction(dragState.id, { x: newX, y: newY });
            }
          } else if (dragState.target === 'image') {
            props.onUpdateImage(dragState.id, { x: newX, y: newY });
          }
        } else if (dragState.type === 'resize') {
          const handle = dragState.handle || 'se';
          let newW = dragState.initW;
          let newH = dragState.initH;
          let newX = dragState.initX;
          let newY = dragState.initY;

          if (handle.includes('e')) newW = Math.max(20, dragState.initW + dx);
          if (handle.includes('s')) newH = Math.max(14, dragState.initH + dy);
          if (handle.includes('w')) {
            newW = Math.max(20, dragState.initW - dx);
            newX = dragState.initX + (dragState.initW - newW);
          }
          if (handle.includes('n')) {
            newH = Math.max(14, dragState.initH - dy);
            newY = dragState.initY + (dragState.initH - newH);
          }

          if (dragState.target === 'text') {
            props.onUpdateTextBox(dragState.id, { width: newW, height: newH, x: newX, y: newY });
          } else if (dragState.target === 'redaction') {
            props.onUpdateRedaction(dragState.id, { width: newW, height: newH, x: newX, y: newY });
          } else if (dragState.target === 'image') {
            props.onUpdateImage(dragState.id, { width: newW, height: newH, x: newX, y: newY });
          }
        } else if (dragState.type === 'rotate' && dragState.target === 'image') {
          const centerX = dragState.initX + dragState.initW / 2;
          const centerY = dragState.initY + dragState.initH / 2;
          const currentPt = getPagePoint(e);
          const rad = Math.atan2(currentPt.y - centerY, currentPt.x - centerX);
          const deg = Math.round((rad * (180 / Math.PI) + 90) % 360);
          props.onUpdateImage(dragState.id, { rotation: deg < 0 ? deg + 360 : deg });
        }
      }
    };

    const handleMouseUp = () => {
      const props = latestPropsRef.current;

      setIsErasing(false);

      const drawnPts = currentPointsRef.current;
      if (isDrawing && drawnPts.length > 1) {
        props.onAddDrawing({
          id: `draw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          page: props.pageNumber,
          points: drawnPts,
          color: props.drawColor,
          strokeWidth: props.strokeWidth,
          opacity: props.toolMode === 'highlighter' ? 0.35 : props.drawOpacity,
          isHighlighter: props.toolMode === 'highlighter',
        });
      }
      currentPointsRef.current = [];
      setIsDrawing(false);
      setCurrentPoints([]);

      const shapeBox = draftShapeRef.current;
      if (
        isCreatingShape &&
        shapeBox &&
        Math.hypot(shapeBox.x2 - shapeBox.x1, shapeBox.y2 - shapeBox.y1) > 4
      ) {
        const hasFill =
          (props.shapeKind === 'rect' || props.shapeKind === 'ellipse') &&
          props.shapeFillEnabled;
        const newId = `shape-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        props.onAddShape({
          id: newId,
          page: props.pageNumber,
          kind: props.shapeKind,
          x1: shapeBox.x1,
          y1: shapeBox.y1,
          x2: shapeBox.x2,
          y2: shapeBox.y2,
          color: props.drawColor,
          fillColor: hasFill ? props.shapeFillColor : 'transparent',
          strokeWidth: props.strokeWidth,
          opacity: props.drawOpacity,
        });
        props.onSelectShape(newId);
      }
      draftShapeRef.current = null;
      setIsCreatingShape(false);
      setDraftShape(null);

      const regionPts = currentRegionPointsRef.current;
      if (isCreatingRegion && regionPts.length >= 2) {
        let pts = regionPts;
        if (pts.length === 2) {
          const p1 = pts[0];
          const p2 = pts[1];
          pts = [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }];
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        if (maxX - minX > 2 || maxY - minY > 2) {
          const newId = `fill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          props.onAddRedaction({
            id: newId,
            page: props.pageNumber,
            points: pts,
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.max(4, Math.round(maxX - minX)),
            height: Math.max(4, Math.round(maxY - minY)),
            fillColor: props.redactColor,
            opacity: props.redactOpacity,
          });
          props.onSelectRedaction(newId);
        }
      }
      currentRegionPointsRef.current = [];
      setIsCreatingRegion(false);
      setCurrentRegionPoints([]);

      if (dragState && didDragMoveRef.current) {
        props.onCommitHistory?.(`${dragState.type} ${dragState.target}`);
      }
      didDragMoveRef.current = false;
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDrawing, isCreatingRegion, isCreatingShape, isErasing, dragState]);

  const pointsToSvgPath = (pts: Point[]): string => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.1} ${pts[0].y + 0.1}`;
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      path += ` L ${pts[i].x} ${pts[i].y}`;
    }
    return path;
  };

  return (
    <div
      ref={containerRef}
      id={`page-overlay-${pageNumber}`}
      onMouseDown={handleMouseDown}
      className={`absolute inset-0 select-none ${
        toolMode === 'hand'
          ? 'cursor-grab active:cursor-grabbing'
          : toolMode === 'text'
          ? 'cursor-text'
          : toolMode === 'draw' ||
            toolMode === 'highlighter' ||
            toolMode === 'shape' ||
            toolMode === 'redact' ||
            toolMode === 'eraser' ||
            toolMode === 'eyedropper'
          ? 'cursor-crosshair'
          : 'cursor-default'
      }`}
      style={{
        width: width * scale,
        height: height * scale,
      }}
    >
      {/* 1. EXTRACTED TEXT LAYER (clickable to replace inline with original-text masking) */}
      {(toolMode === 'select' || toolMode === 'text') &&
        extractedTexts.map((item) => {
          const isReplaced = textboxes.some(
            (t) =>
              t.isOriginalExtracted &&
              Math.abs(t.x - item.x) < 6 &&
              Math.abs(t.y - item.y) < 6
          );
          if (isReplaced) return null;

          return (
            <div
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                const sampledBg =
                  onSampleBackgroundColor?.(
                    Math.max(0, item.x - 2),
                    Math.max(0, item.y - 2)
                  ) || '#ffffff';
                const boxX = Math.round(item.x);
                const boxY = Math.round(item.y);
                const boxW = Math.max(Math.round(item.width + 14), 60);
                const boxH = Math.max(Math.round(item.height + 6), 20);
                const newBox: TextBoxAnnotation = {
                  id: `text-extracted-${item.id}-${Date.now()}`,
                  page: pageNumber,
                  x: boxX,
                  y: boxY,
                  width: boxW,
                  height: boxH,
                  text: item.text,
                  fontSize: item.fontSize || 14,
                  fontFamily: 'Helvetica',
                  fontWeight: 'normal',
                  color: '#1e293b',
                  textAlign: 'left',
                  lineHeight: 1.2,
                  isOriginalExtracted: true,
                  maskOriginalText: true,
                  maskColor: sampledBg,
                  maskRect: {
                    x: Math.max(0, item.x - 1),
                    y: Math.max(0, item.y - 1),
                    width: item.width + 4,
                    height: item.height + 4,
                  },
                };
                onAddTextBox(newBox);
                onSelectText(newBox.id);
              }}
              title="Click to edit this text"
              className="absolute opacity-0 hover:opacity-100 hover:bg-blue-500/10 hover:outline hover:outline-1 hover:outline-blue-400 cursor-pointer transition-opacity rounded-xs pointer-events-auto"
              style={{
                left: item.x * scale,
                top: item.y * scale,
                width: item.width * scale,
                height: item.height * scale,
              }}
            />
          );
        })}

      {/* 2. SVG VECTOR DRAWINGS, HIGHLIGHTERS & SHAPES */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${width} ${height}`}
        style={{ zIndex: 13 }}
      >
        {drawings.map((d) => {
          const isSelected = d.id === selectedDrawingId;
          return (
            <g key={d.id}>
              {toolMode === 'select' && (
                <path
                  d={pointsToSvgPath(d.points)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(12, d.strokeWidth + 8)}
                  className="cursor-pointer pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAllSelections();
                    onSelectDrawing(d.id);
                  }}
                />
              )}
              <path
                d={pointsToSvgPath(d.points)}
                fill="none"
                stroke={isSelected ? '#3b82f6' : d.color}
                strokeWidth={isSelected ? d.strokeWidth + 1.5 : d.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={d.opacity}
                className="pointer-events-none"
                style={{
                  mixBlendMode: d.isHighlighter ? 'multiply' : 'normal',
                }}
              />
            </g>
          );
        })}

        {shapes.map((s) => {
          const isSelected = s.id === selectedShapeId;
          return (
            <g key={s.id}>
              {renderShapeSvgElement(s, isSelected, toolMode === 'select', {
                onClick: (e) => {
                  e.stopPropagation();
                  clearAllSelections();
                  onSelectShape(s.id);
                },
                onMouseDown: (e) => {
                  if (toolMode !== 'select') return;
                  e.stopPropagation();
                  clearAllSelections();
                  onSelectShape(s.id);
                  setDragState({
                    type: 'move',
                    target: 'shape',
                    id: s.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    initX: s.x1,
                    initY: s.y1,
                    initW: Math.abs(s.x2 - s.x1),
                    initH: Math.abs(s.y2 - s.y1),
                    initX2: s.x2,
                    initY2: s.y2,
                  });
                },
              })}
            </g>
          );
        })}

        {isDrawing && currentPoints.length > 0 && (
          <path
            d={pointsToSvgPath(currentPoints)}
            fill="none"
            stroke={drawColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={toolMode === 'highlighter' ? 0.35 : drawOpacity}
            style={{
              mixBlendMode: toolMode === 'highlighter' ? 'multiply' : 'normal',
            }}
          />
        )}

        {isCreatingShape &&
          draftShape &&
          renderShapeSvgElement(
            {
              kind: shapeKind,
              ...draftShape,
              color: drawColor,
              fillColor:
                (shapeKind === 'rect' || shapeKind === 'ellipse') && shapeFillEnabled
                  ? shapeFillColor
                  : 'transparent',
              strokeWidth,
              opacity: drawOpacity,
            },
            false,
            false
          )}
      </svg>

      {/* 3. FILLED REGIONS & REDACTIONS */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 12 }}
      >
        {redactions.map((r) => {
          const isSelected = r.id === selectedRedactionId;
          if (r.points && r.points.length > 2) {
            const pointsStr = r.points
              .map((p) => `${p.x * scale},${p.y * scale}`)
              .join(' ');
            return (
              <polygon
                key={r.id}
                id={`filled-region-${r.id}`}
                points={pointsStr}
                fill={r.fillColor}
                fillOpacity={r.opacity !== undefined ? r.opacity : 1.0}
                stroke={isSelected ? '#3b82f6' : 'transparent'}
                strokeWidth={isSelected ? 2 : 0}
                strokeDasharray={isSelected ? '4 2' : undefined}
                className={
                  toolMode === 'select'
                    ? 'cursor-pointer pointer-events-auto transition-colors'
                    : 'pointer-events-none transition-colors'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllSelections();
                  onSelectRedaction(r.id);
                }}
                onMouseDown={(e) => {
                  if (toolMode !== 'select') return;
                  e.stopPropagation();
                  clearAllSelections();
                  onSelectRedaction(r.id);
                  setDragState({
                    type: 'move',
                    target: 'redaction',
                    id: r.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    initX: r.x,
                    initY: r.y,
                    initW: r.width,
                    initH: r.height,
                    initPoints: r.points,
                  });
                }}
              />
            );
          }
          return (
            <rect
              key={r.id}
              id={`redaction-rect-${r.id}`}
              x={r.x * scale}
              y={r.y * scale}
              width={r.width * scale}
              height={r.height * scale}
              fill={r.fillColor}
              fillOpacity={r.opacity !== undefined ? r.opacity : 1.0}
              stroke={isSelected ? '#3b82f6' : 'transparent'}
              strokeWidth={isSelected ? 2 : 0}
              strokeDasharray={isSelected ? '4 2' : undefined}
              className={
                toolMode === 'select'
                  ? 'cursor-pointer pointer-events-auto transition-colors'
                  : 'pointer-events-none transition-colors'
              }
              onClick={(e) => {
                e.stopPropagation();
                clearAllSelections();
                onSelectRedaction(r.id);
              }}
              onMouseDown={(e) => {
                if (toolMode !== 'select') return;
                e.stopPropagation();
                clearAllSelections();
                onSelectRedaction(r.id);
                setDragState({
                  type: 'move',
                  target: 'redaction',
                  id: r.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  initX: r.x,
                  initY: r.y,
                  initW: r.width,
                  initH: r.height,
                });
              }}
            />
          );
        })}

        {isCreatingRegion && currentRegionPoints.length > 1 && (
          <polygon
            points={currentRegionPoints
              .map((p) => `${p.x * scale},${p.y * scale}`)
              .join(' ')}
            fill={redactColor}
            fillOpacity={redactOpacity}
            stroke={redactColor}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}
      </svg>

      {/* 4. INSERTED IMAGES / SIGNATURES */}
      {images.map((img) => {
        const isSelected = img.id === selectedImageId;
        return (
          <div
            key={img.id}
            id={`image-annotation-${img.id}`}
            onClick={(e) => {
              e.stopPropagation();
              clearAllSelections();
              onSelectImage(img.id);
            }}
            onMouseDown={(e) => {
              if (toolMode !== 'select') return;
              e.stopPropagation();
              clearAllSelections();
              onSelectImage(img.id);
              setDragState({
                type: 'move',
                target: 'image',
                id: img.id,
                startX: e.clientX,
                startY: e.clientY,
                initX: img.x,
                initY: img.y,
                initW: img.width,
                initH: img.height,
              });
            }}
            className={`absolute group ${
              toolMode === 'select' ? 'cursor-move pointer-events-auto' : 'pointer-events-none'
            } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
            style={{
              left: img.x * scale,
              top: img.y * scale,
              width: img.width * scale,
              height: img.height * scale,
              transform: `rotate(${img.rotation || 0}deg)`,
              zIndex: 14,
            }}
          >
            <img
              src={img.dataUrl}
              alt="Annotation"
              className="w-full h-full object-contain pointer-events-none select-none"
              referrerPolicy="no-referrer"
            />

            {isSelected && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteImage(img.id);
                  }}
                  className="absolute -top-3 -right-3 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-transform hover:scale-110"
                  title="Delete image"
                >
                  <Trash2 className="w-3 h-3" />
                </button>

                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDragState({
                      type: 'rotate',
                      target: 'image',
                      id: img.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      initX: img.x,
                      initY: img.y,
                      initW: img.width,
                      initH: img.height,
                    });
                  }}
                  className="absolute -top-6 left-1/2 -translate-x-1/2 p-1 bg-blue-600 text-white rounded-full cursor-grab active:cursor-grabbing shadow"
                  title="Drag to rotate image"
                >
                  <RotateCw className="w-3 h-3" />
                </div>

                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDragState({
                      type: 'resize',
                      target: 'image',
                      id: img.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      initX: img.x,
                      initY: img.y,
                      initW: img.width,
                      initH: img.height,
                      handle: 'se',
                    });
                  }}
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 border border-white rounded-xs cursor-se-resize shadow"
                />
              </>
            )}
          </div>
        );
      })}

      {/* 5. TEXT BOXES (with optional original-text background mask) */}
      {textboxes.map((tb) => {
        const isSelected = tb.id === selectedTextId;
        return (
          <div
            key={tb.id}
            id={`textbox-${tb.id}`}
            onClick={(e) => {
              e.stopPropagation();
              clearAllSelections();
              onSelectText(tb.id);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              clearAllSelections();
              onSelectText(tb.id);
            }}
            className={`absolute group cursor-text transition-shadow rounded-sm ${
              toolMode === 'select' || toolMode === 'text'
                ? 'pointer-events-auto'
                : 'pointer-events-none'
            } ${
              isSelected
                ? 'ring-2 ring-blue-500'
                : 'hover:ring-1 hover:ring-blue-400/50'
            }`}
            style={{
              left: tb.x * scale,
              top: tb.y * scale,
              width: tb.width * scale,
              minHeight: tb.height * scale,
              backgroundColor: tb.maskOriginalText
                ? tb.maskColor || '#ffffff'
                : isSelected
                ? 'rgba(59, 130, 246, 0.08)'
                : 'transparent',
              zIndex: 15,
            }}
          >
            {isSelected && (
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragState({
                    type: 'move',
                    target: 'text',
                    id: tb.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    initX: tb.x,
                    initY: tb.y,
                    initW: tb.width,
                    initH: tb.height,
                  });
                }}
                className="absolute -top-5 left-0 px-1.5 py-0.5 bg-blue-600 text-white rounded-t text-[9px] font-medium flex items-center gap-1 cursor-move select-none shadow"
              >
                <Move className="w-2.5 h-2.5" />
                <span>Move</span>
              </div>
            )}

            <textarea
              value={tb.text}
              onFocus={() => {
                clearAllSelections();
                onSelectText(tb.id);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelectText(tb.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectText(tb.id);
              }}
              onChange={(e) => {
                textEditedRef.current = true;
                onUpdateTextBox(tb.id, { text: e.target.value });
              }}
              onBlur={() => {
                if (textEditedRef.current) {
                  textEditedRef.current = false;
                  onCommitHistory?.('Edit Text');
                }
              }}
              className="w-full h-full p-1 bg-transparent resize-none focus:outline-none overflow-hidden leading-tight"
              style={{
                fontSize: `${tb.fontSize * scale}px`,
                fontFamily:
                  tb.fontFamily === 'Courier'
                    ? 'monospace'
                    : tb.fontFamily === 'Times-Roman' || tb.fontFamily === 'Georgia'
                    ? 'serif'
                    : 'sans-serif',
                fontWeight: tb.fontWeight,
                color: tb.color,
                textAlign: tb.textAlign,
                lineHeight: tb.lineHeight || 1.2,
              }}
            />

            {isSelected && (
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragState({
                    type: 'resize',
                    target: 'text',
                    id: tb.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    initX: tb.x,
                    initY: tb.y,
                    initW: tb.width,
                    initH: tb.height,
                    handle: 'se',
                  });
                }}
                className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-600 border border-white rounded-xs cursor-se-resize shadow"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
