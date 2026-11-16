import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
  useMemo,
  useTransition,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  FormEvent,
  RefObject,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { motion, AnimatePresence } from 'motion/react';
import PDFPageView from './PDFPageView';
import {
  ToolMode,
  ShapeKind,
  ViewMode,
  DrawingAnnotation,
  ShapeAnnotation,
  TextBoxAnnotation,
  RedactionAnnotation,
  ImageAnnotation,
  PageDimension,
  CropBox,
  PageItem,
} from '../types/pdf';
import { ChevronLeft, ChevronRight, UploadCloud } from 'lucide-react';

interface ZoomAnchor {
  pageElId: string;
  normX: number;
  normY: number;
  cursorX: number;
  cursorY: number;
}

interface PDFViewerContainerProps {
  viewportRef?: RefObject<HTMLDivElement | null>;
  pdfDocument: pdfjsLib.PDFDocumentProxy | null;
  numPages: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  scale: number;
  setScale: (scale: number | ((prev: number) => number)) => void;
  toolMode: ToolMode;
  shapeKind: ShapeKind;
  shapeFillEnabled: boolean;
  shapeFillColor: string;
  viewMode: ViewMode;
  pageRotations: Record<number, number>;
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
  onReportThumbnail: (pageNumber: number, url: string) => void;
  onDropFile: (file: File) => void;
  globalInvert?: boolean;
  pageInverts?: Record<number, boolean>;
  crops?: Record<number, CropBox>;
  activeCropSession?: {
    type: 'all' | 'individual';
    pageNumber?: number;
    pendingCrop: CropBox;
    lockedRatio?: number | null;
  } | null;
  onCropChange?: (newCrop: CropBox) => void;
  pages?: PageItem[];
  onCommitHistory?: (description: string) => void;
}

export default function PDFViewerContainer({
  viewportRef,
  pdfDocument,
  numPages,
  currentPage,
  setCurrentPage,
  scale,
  setScale,
  toolMode,
  shapeKind,
  shapeFillEnabled,
  shapeFillColor,
  viewMode,
  pageRotations,
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
  onDropFile,
  globalInvert = false,
  pageInverts = {},
  crops = {},
  activeCropSession,
  onCropChange,
  pages,
  onCommitHistory,
}: PDFViewerContainerProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = viewportRef || internalScrollRef;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [, startTransition] = useTransition();

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const lastCenterAnchorRef = useRef<ZoomAnchor | null>(null);
  const prevScaleRef = useRef<number>(scale);
  const isRestoringZoomRef = useRef<boolean>(false);

  const activePages = useMemo(() => {
    if (pages && pages.length > 0) return pages;
    return Array.from({ length: numPages }, (_, i) => ({
      id: String(i + 1),
      pdfPageNum: i + 1,
      label: `Page ${i + 1}`,
    }));
  }, [pages, numPages]);

  const totalDisplayPages = activePages.length;
  const currentDisplayIndex = useMemo(() => {
    const idx = activePages.findIndex((p) => p.pdfPageNum === currentPage);
    return idx >= 0 ? idx + 1 : 1;
  }, [activePages, currentPage]);

  const [pageInputVal, setPageInputVal] = useState<string>(String(currentDisplayIndex));

  useEffect(() => {
    setPageInputVal(String(currentDisplayIndex));
  }, [currentDisplayIndex]);

  const captureAnchorAtClientPoint = useCallback(
    (clientX?: number, clientY?: number): ZoomAnchor | null => {
      const container = scrollContainerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      const cursorX =
        typeof clientX === 'number'
          ? Math.max(0, Math.min(container.clientWidth, clientX - rect.left))
          : container.clientWidth / 2;
      const cursorY =
        typeof clientY === 'number'
          ? Math.max(0, Math.min(container.clientHeight, clientY - rect.top))
          : container.clientHeight / 2;

      const contentX = container.scrollLeft + cursorX;
      const contentY = container.scrollTop + cursorY;

      const pageElements = container.querySelectorAll('[id^="pdf-page-"]');
      if (pageElements.length === 0) return null;

      let bestEl = pageElements[0] as HTMLElement;
      let bestDist = Infinity;

      for (let i = 0; i < pageElements.length; i++) {
        const el = pageElements[i] as HTMLElement;
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        const left = el.offsetLeft;
        const right = left + el.offsetWidth;

        const dy = contentY < top ? top - contentY : contentY > bottom ? contentY - bottom : 0;
        const dx = contentX < left ? left - contentX : contentX > right ? contentX - right : 0;
        const dist = dy * 10 + dx;

        if (dist === 0) {
          bestEl = el;
          break;
        }
        if (dist < bestDist) {
          bestDist = dist;
          bestEl = el;
        }
      }

      return {
        pageElId: bestEl.id,
        normX: (contentX - bestEl.offsetLeft) / Math.max(1, bestEl.offsetWidth),
        normY: (contentY - bestEl.offsetTop) / Math.max(1, bestEl.offsetHeight),
        cursorX,
        cursorY,
      };
    },
    [scrollContainerRef]
  );

  // Restore exact anchored pixel position synchronously before browser paints zoomed frame
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || prevScaleRef.current === scale) {
      prevScaleRef.current = scale;
      return;
    }
    prevScaleRef.current = scale;

    const anchor = zoomAnchorRef.current || lastCenterAnchorRef.current;
    zoomAnchorRef.current = null;
    if (!anchor) return;

    const pageEl = document.getElementById(anchor.pageElId);
    if (!pageEl) return;

    isRestoringZoomRef.current = true;
    container.scrollTop = Math.max(
      0,
      pageEl.offsetTop + anchor.normY * pageEl.offsetHeight - anchor.cursorY
    );
    container.scrollLeft = Math.max(
      0,
      pageEl.offsetLeft + anchor.normX * pageEl.offsetWidth - anchor.cursorX
    );

    lastCenterAnchorRef.current = captureAnchorAtClientPoint();

    const raf = requestAnimationFrame(() => {
      isRestoringZoomRef.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [scale, scrollContainerRef, captureAnchorAtClientPoint]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY === 0) return;

        // Capture cursor anchor before scale changes so target point stays pinned
        zoomAnchorRef.current = captureAnchorAtClientPoint(e.clientX, e.clientY);

        // Smooth proportional factor handles both discrete mouse wheel ticks and fine trackpad pinch
        const isTrackpad = Math.abs(e.deltaY) < 40;
        const factor = isTrackpad
          ? Math.exp(-e.deltaY * 0.006)
          : e.deltaY < 0
          ? 1.1
          : 1 / 1.1;

        setScale((prev) =>
          Math.min(3.0, Math.max(0.3, Number((prev * factor).toFixed(3))))
        );
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomAnchorRef.current = captureAnchorAtClientPoint();
        setScale((prev) => Math.min(3.0, Number((prev + 0.15).toFixed(2))));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomAnchorRef.current = captureAnchorAtClientPoint();
        setScale((prev) => Math.max(0.3, Number((prev - 0.15).toFixed(2))));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        zoomAnchorRef.current = captureAnchorAtClientPoint();
        setScale(1.0);
      }
    };

    const handleGlobalMouseUp = () => {
      isPanningRef.current = false;
    };

    if (container) {
      container.addEventListener('wheel', handleWheel, {
        passive: false,
        capture: true,
      });
    }
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel, { capture: true });
      }
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [setScale, scrollContainerRef, captureAnchorAtClientPoint]);

  const handleScroll = () => {
    if (isRestoringZoomRef.current) return;
    lastCenterAnchorRef.current = captureAnchorAtClientPoint();
    if (viewMode !== 'vertical' || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const pageElements = container.querySelectorAll('[id^="pdf-page-"]');
    const containerMid = container.scrollTop + container.clientHeight / 2;

    for (let i = 0; i < pageElements.length; i++) {
      const el = pageElements[i] as HTMLElement;
      if (
        el.offsetTop <= containerMid &&
        el.offsetTop + el.offsetHeight >= containerMid
      ) {
        const pageNum = parseInt(el.id.replace('pdf-page-', ''), 10);
        if (pageNum && pageNum !== currentPage) {
          startTransition(() => {
            setCurrentPage(pageNum);
          });
        }
        break;
      }
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onDropFile(e.dataTransfer.files[0]);
    }
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    if (e.target === scrollContainerRef.current) {
      onSelectText(null);
      onSelectRedaction(null);
      onSelectImage(null);
      onSelectShape(null);
      onSelectDrawing(null);
    }
    if (toolMode === 'hand' && scrollContainerRef.current) {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: scrollContainerRef.current.scrollLeft,
        scrollTop: scrollContainerRef.current.scrollTop,
      };
    }
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (isPanningRef.current && scrollContainerRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      scrollContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      scrollContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
  };

  const scrollToPdfPage = (pdfPageNum: number) => {
    const pageEl = document.getElementById(`pdf-page-${pdfPageNum}`);
    if (pageEl && scrollContainerRef.current) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentPage(pdfPageNum);
    }
  };

  const handlePageInputSubmit = (e: FormEvent) => {
    e.preventDefault();
    const displayNum = parseInt(pageInputVal, 10);
    if (displayNum >= 1 && displayNum <= totalDisplayPages) {
      const target = activePages[displayNum - 1];
      if (target) scrollToPdfPage(target.pdfPageNum);
    } else {
      setPageInputVal(String(currentDisplayIndex));
    }
  };

  return (
    <div
      id="pdf-viewport-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 h-full bg-[#0B0D11] overflow-hidden flex flex-col select-none"
    >
      {/* Main Scrollable Canvas Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 overflow-auto p-8 relative flex ${
          viewMode === 'vertical'
            ? 'flex-col items-center'
            : 'flex-wrap justify-center content-start gap-8'
        } ${toolMode === 'hand' ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {numPages > 0 && activePages.length > 0 ? (
          activePages.map((pageItem) => {
            const pageNum = pageItem.pdfPageNum;
            return (
              <PDFPageView
                key={pageItem.id}
                pdfDocument={pdfDocument}
                pageNumber={pageNum}
                scale={scale}
                toolMode={toolMode}
                shapeKind={shapeKind}
                shapeFillEnabled={shapeFillEnabled}
                shapeFillColor={shapeFillColor}
                pageRotation={pageRotations[pageNum] || 0}
                globalRotation={globalRotation}
                drawings={drawings}
                shapes={shapes}
                textboxes={textboxes}
                redactions={redactions}
                images={images}
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
                onColorSampled={onColorSampled}
                onReportDimension={onReportDimension}
                onReportThumbnail={onReportThumbnail}
                isInverted={Boolean(globalInvert || pageInverts[pageNum])}
                crop={crops[pageNum]}
                isCroppingThisPage={Boolean(
                  activeCropSession &&
                    (activeCropSession.type === 'all' ||
                      activeCropSession.pageNumber === pageNum)
                )}
                activeCropBox={activeCropSession ? activeCropSession.pendingCrop : undefined}
                lockedCropRatio={activeCropSession?.lockedRatio ?? null}
                onCropChange={onCropChange}
                onCommitHistory={onCommitHistory}
              />
            );
          })
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="m-auto flex flex-col items-center justify-center text-center p-6 max-w-md select-none"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onDropFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
            <motion.div
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-10 border border-dashed border-white/[0.14] hover:border-blue-500/70 bg-[#11141B] hover:bg-[#151A24] rounded-xl cursor-pointer transition-colors group"
            >
              <div className="w-12 h-12 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center mb-4 group-hover:border-blue-500/40 transition-colors">
                <UploadCloud className="w-6 h-6 text-blue-400 group-hover:-translate-y-0.5 transition-transform" />
              </div>
              <h3 className="text-base font-semibold text-zinc-100 mb-1">
                Open a PDF or Image
              </h3>
              <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                Drop a PDF to edit, or drop a PNG/JPEG/WebP image to start a new PDF. Everything stays private on your device.
              </p>
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 group-hover:bg-blue-500 text-white rounded-md text-xs font-semibold transition-colors pointer-events-none"
              >
                Choose File
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Floating Bottom Navigation Jump Bar */}
      <AnimatePresence>
        {totalDisplayPages > 0 && (
          <motion.div
            id="page-navigation-dock"
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#161A23]/95 backdrop-blur border border-white/[0.1] text-zinc-200 px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-2 text-xs z-30"
          >
            <button
              id="nav-prev-page"
              type="button"
              onClick={() => {
                const target = activePages[currentDisplayIndex - 2];
                if (target) scrollToPdfPage(target.pdfPageNum);
              }}
              disabled={currentDisplayIndex <= 1}
              className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent text-zinc-300 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5">
              <span className="text-zinc-400">Page</span>
              <input
                id="page-jump-input"
                type="text"
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value)}
                onBlur={() => setPageInputVal(String(currentDisplayIndex))}
                className="w-10 bg-[#0B0D11] border border-white/[0.12] rounded px-1 py-0.5 text-center font-mono tabular-nums text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-zinc-400 font-mono tabular-nums">
                / {totalDisplayPages}
              </span>
            </form>

            <button
              id="nav-next-page"
              type="button"
              onClick={() => {
                const target = activePages[currentDisplayIndex];
                if (target) scrollToPdfPage(target.pdfPageNum);
              }}
              disabled={currentDisplayIndex >= totalDisplayPages}
              className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-transparent text-zinc-300 transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag and Drop Ingestion Overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            id="drag-drop-overlay"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-[#0B0D11]/85 backdrop-blur-sm border-2 border-dashed border-blue-500/70 flex flex-col items-center justify-center text-white z-50 pointer-events-none"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
            >
              <UploadCloud className="w-12 h-12 text-blue-400 mb-3" />
            </motion.div>
            <p className="text-base font-semibold text-zinc-100">Drop PDF or Image</p>
            <p className="text-xs text-zinc-400 mt-1">
              Processed locally on your device
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
