import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PageAnnotationOverlay from './PageAnnotationOverlay';
import {
  ToolMode,
  ShapeKind,
  DrawingAnnotation,
  ShapeAnnotation,
  TextBoxAnnotation,
  RedactionAnnotation,
  ImageAnnotation,
  ExtractedTextItem,
  PageDimension,
  CropBox,
} from '../types/pdf';
import {
  extractTextFromPage,
  sampleCanvasPixel,
  sampleRegionBackground,
} from '../utils/pdfHelpers';
import CropOverlay from './CropOverlay';

interface PDFPageViewProps {
  key?: number | string;
  pdfDocument: pdfjsLib.PDFDocumentProxy | null;
  pageNumber: number;
  scale: number;
  toolMode: ToolMode;
  shapeKind: ShapeKind;
  shapeFillEnabled: boolean;
  shapeFillColor: string;
  pageRotation: number;
  globalRotation: number;
  drawings: DrawingAnnotation[];
  shapes: ShapeAnnotation[];
  textboxes: TextBoxAnnotation[];
  redactions: RedactionAnnotation[];
  images: ImageAnnotation[];
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
  onColorSampled: (color: string) => void;
  onReportDimension: (dim: PageDimension) => void;
  onReportThumbnail?: (pageNumber: number, url: string) => void;
  isInverted?: boolean;
  crop?: CropBox;
  isCroppingThisPage?: boolean;
  activeCropBox?: CropBox;
  lockedCropRatio?: number | null;
  onCropChange?: (newCrop: CropBox) => void;
  onCommitHistory?: (description: string) => void;
}

export default function PDFPageView({
  pdfDocument,
  pageNumber,
  scale,
  toolMode,
  shapeKind,
  shapeFillEnabled,
  shapeFillColor,
  pageRotation,
  globalRotation,
  drawings,
  shapes,
  textboxes,
  redactions,
  images,
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
  onColorSampled,
  onReportDimension,
  onReportThumbnail,
  isInverted = false,
  crop,
  isCroppingThisPage = false,
  activeCropBox,
  lockedCropRatio = null,
  onCropChange,
  onCommitHistory,
}: PDFPageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseWidth, setBaseWidth] = useState(600);
  const [baseHeight, setBaseHeight] = useState(800);
  const [extractedTexts, setExtractedTexts] = useState<ExtractedTextItem[]>([]);
  const [isVisible, setIsVisible] = useState(pageNumber <= 3);
  const renderTaskRef = useRef<any>(null);
  const lastThumbKeyRef = useRef<string>('');
  const lastRenderedScaleRef = useRef<number | null>(null);
  const lastRenderedKeyRef = useRef<string>('');
  const [hasEntered, setHasEntered] = useState(false);

  const userRotation = ((pageRotation + globalRotation) % 360 + 360) % 360;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Viewport virtualization: track proximity to scroll viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { rootMargin: '900px 300px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Lightweight dimension measurement even when off-screen
  useEffect(() => {
    let isCancelled = false;

    async function syncDimensions() {
      if (!pdfDocument) return;
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (isCancelled) return;
        const effectiveRotation = (((page.rotate || 0) + userRotation) % 360 + 360) % 360;
        const unscaledViewport = page.getViewport({
          scale: 1,
          rotation: effectiveRotation,
        });
        setBaseWidth(unscaledViewport.width);
        setBaseHeight(unscaledViewport.height);
        onReportDimension({
          pageNumber,
          width: unscaledViewport.width,
          height: unscaledViewport.height,
          originalRotation: page.rotate || 0,
        });
      } catch {
        // Ignore dimension read errors during teardown
      }
    }

    syncDimensions();
    return () => {
      isCancelled = true;
    };
  }, [pdfDocument, pageNumber, userRotation, onReportDimension]);

  // High-DPI double-buffered Canvas rendering only while near/in viewport
  useEffect(() => {
    if (!isVisible) {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      lastRenderedScaleRef.current = null;
      lastRenderedKeyRef.current = '';
      return;
    }

    let isCancelled = false;
    const renderKey = `${pageNumber}-${userRotation}-${pdfDocument?.fingerprints?.[0] || 'doc'}`;
    const isScaleOnlyUpdate =
      lastRenderedKeyRef.current === renderKey &&
      lastRenderedScaleRef.current !== null &&
      canvasRef.current &&
      canvasRef.current.width > 0;

    async function renderPage() {
      if (!pdfDocument || !canvasRef.current) return;

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          await renderTaskRef.current.promise.catch(() => {});
          renderTaskRef.current = null;
        }
        if (isCancelled) return;

        const page = await pdfDocument.getPage(pageNumber);
        if (isCancelled) return;

        const effectiveRotation = (((page.rotate || 0) + userRotation) % 360 + 360) % 360;

        const unscaledViewport = page.getViewport({
          scale: 1,
          rotation: effectiveRotation,
        });
        setBaseWidth(unscaledViewport.width);
        setBaseHeight(unscaledViewport.height);

        extractTextFromPage(page, unscaledViewport).then((items) => {
          if (!isCancelled) setExtractedTexts(items);
        });

        const dpr = Math.max(window.devicePixelRatio || 1, 1.5);
        const renderScale = scale * dpr;
        const viewport = page.getViewport({
          scale: renderScale,
          rotation: effectiveRotation,
        });

        const targetW = Math.max(1, Math.floor(viewport.width));
        const targetH = Math.max(1, Math.floor(viewport.height));

        // Render into offscreen canvas so visible canvas scales smoothly without blank flicker
        const offscreen = document.createElement('canvas');
        offscreen.width = targetW;
        offscreen.height = targetH;
        const offCtx = offscreen.getContext('2d', { alpha: false });
        if (!offCtx || isCancelled) return;

        const renderTask = page.render({
          canvasContext: offCtx,
          viewport,
        });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        canvas.width = targetW;
        canvas.height = targetH;
        context.drawImage(offscreen, 0, 0);

        lastRenderedScaleRef.current = scale;
        lastRenderedKeyRef.current = renderKey;

        const docId = pdfDocument.fingerprints?.[0] || 'doc';
        const thumbKey = `${docId}-${pageNumber}-${effectiveRotation}`;
        if (onReportThumbnail && !isCancelled && lastThumbKeyRef.current !== thumbKey) {
          try {
            const thumbMaxW = 240;
            const ratio = Math.min(1, thumbMaxW / Math.max(1, offscreen.width));
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = Math.max(1, Math.round(offscreen.width * ratio));
            thumbCanvas.height = Math.max(1, Math.round(offscreen.height * ratio));
            const thumbCtx = thumbCanvas.getContext('2d');
            if (thumbCtx) {
              thumbCtx.drawImage(offscreen, 0, 0, thumbCanvas.width, thumbCanvas.height);
              const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);
              lastThumbKeyRef.current = thumbKey;
              onReportThumbnail(pageNumber, thumbUrl);
            }
          } catch {
            // Ignore thumbnail errors
          }
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('PDF page rendering error:', err);
        }
      }
    }

    const delay = isScaleOnlyUpdate ? 90 : 0;
    const timer = window.setTimeout(() => {
      if (!isCancelled) {
        renderPage();
      }
    }, delay);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDocument, pageNumber, scale, userRotation, isVisible]);

  const handleSampleColorAtPoint = (clientX: number, clientY: number) => {
    if (canvasRef.current) {
      const sampled = sampleCanvasPixel(canvasRef.current, clientX, clientY);
      if (sampled) {
        onColorSampled(sampled);
      }
    }
  };

  const handleSampleBackgroundColor = (pageX: number, pageY: number) => {
    if (!canvasRef.current || canvasRef.current.width === 0) return '#ffffff';
    return sampleRegionBackground(canvasRef.current, pageX, pageY, baseWidth, baseHeight);
  };

  const isCropped = Boolean(
    crop &&
      !isCroppingThisPage &&
      crop.width > 0.001 &&
      crop.height > 0.001 &&
      (crop.x > 0.001 || crop.y > 0.001 || crop.width < 0.999 || crop.height < 0.999)
  );

  const width = baseWidth * scale;
  const height = baseHeight * scale;

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNumber}`}
      className={`relative bg-white shadow-2xl rounded-sm mx-auto my-6 transition-[opacity,filter,box-shadow] duration-200 ${
        hasEntered ? 'opacity-100' : 'opacity-0'
      } ${isInverted ? 'filter invert hue-rotate-180' : ''}`}
      style={{
        width,
        height,
      }}
    >
      <div
        className="relative origin-top-left"
        style={{
          width,
          height,
        }}
      >
        <canvas
          ref={canvasRef}
          className="block rounded-sm pointer-events-none select-none"
          style={{
            width,
            height,
          }}
        />

        <PageAnnotationOverlay
          pageNumber={pageNumber}
          width={baseWidth}
          height={baseHeight}
          scale={scale}
          toolMode={toolMode}
          shapeKind={shapeKind}
          shapeFillEnabled={shapeFillEnabled}
          shapeFillColor={shapeFillColor}
          drawings={drawings.filter((d) => d.page === pageNumber)}
          shapes={shapes.filter((s) => s.page === pageNumber)}
          textboxes={textboxes.filter((t) => t.page === pageNumber)}
          redactions={redactions.filter((r) => r.page === pageNumber)}
          images={images.filter((img) => img.page === pageNumber)}
          extractedTexts={extractedTexts}
          selectedTextId={selectedTextId}
          onSelectText={onSelectText}
          selectedRedactionId={selectedRedactionId}
          onSelectRedaction={onSelectRedaction}
          selectedImageId={selectedImageId}
          onSelectImage={onSelectImage}
          selectedShapeId={selectedShapeId}
          onSelectShape={onSelectShape}
          selectedDrawingId={selectedDrawingId}
          onSelectDrawing={onSelectDrawing}
          onAddDrawing={onAddDrawing}
          onDeleteDrawing={onDeleteDrawing}
          onAddShape={onAddShape}
          onUpdateShape={onUpdateShape}
          onDeleteShape={onDeleteShape}
          onAddTextBox={onAddTextBox}
          onUpdateTextBox={onUpdateTextBox}
          onAddRedaction={onAddRedaction}
          onUpdateRedaction={onUpdateRedaction}
          onUpdateImage={onUpdateImage}
          onDeleteImage={onDeleteImage}
          drawColor={drawColor}
          strokeWidth={strokeWidth}
          drawOpacity={drawOpacity}
          redactColor={redactColor}
          redactOpacity={redactOpacity}
          textColor={textColor}
          onSampleColorAtPoint={handleSampleColorAtPoint}
          onSampleBackgroundColor={handleSampleBackgroundColor}
          onCommitHistory={onCommitHistory}
        />
      </div>

      {isCropped && (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            className="absolute left-0 right-0 top-0 bg-slate-950/70"
            style={{ height: `${crop!.y * 100}%` }}
          />
          <div
            className="absolute left-0 right-0 bottom-0 bg-slate-950/70"
            style={{ top: `${(crop!.y + crop!.height) * 100}%` }}
          />
          <div
            className="absolute left-0 bg-slate-950/70"
            style={{
              top: `${crop!.y * 100}%`,
              height: `${crop!.height * 100}%`,
              width: `${crop!.x * 100}%`,
            }}
          />
          <div
            className="absolute right-0 bg-slate-950/70"
            style={{
              top: `${crop!.y * 100}%`,
              height: `${crop!.height * 100}%`,
              left: `${(crop!.x + crop!.width) * 100}%`,
            }}
          />
          <div
            className="absolute border border-blue-400/80 border-dashed pointer-events-none"
            style={{
              left: `${crop!.x * 100}%`,
              top: `${crop!.y * 100}%`,
              width: `${crop!.width * 100}%`,
              height: `${crop!.height * 100}%`,
            }}
          />
        </div>
      )}

      {isCroppingThisPage && activeCropBox && onCropChange && (
        <CropOverlay
          pageWidth={width}
          pageHeight={height}
          crop={activeCropBox}
          onChange={onCropChange}
          pageNumber={pageNumber}
          lockedRatio={lockedCropRatio}
        />
      )}
    </div>
  );
}
