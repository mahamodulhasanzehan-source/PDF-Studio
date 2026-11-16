import { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { AnimatePresence } from 'motion/react';
import Toolbar from './components/Toolbar';
import PropertiesBar from './components/PropertiesBar';
import SidebarThumbnails from './components/SidebarThumbnails';
import PDFViewerContainer from './components/PDFViewerContainer';
import CropFloatingBar, { CropAspectLock } from './components/CropFloatingBar';
import ExtractPagesModal from './components/ExtractPagesModal';
import SignaturePadModal from './components/SignaturePadModal';
import {
  ToolMode,
  ShapeKind,
  ViewMode,
  AnnotationsState,
  HistoryEntry,
  PageDimension,
  DrawingAnnotation,
  ShapeAnnotation,
  TextBoxAnnotation,
  RedactionAnnotation,
  ImageAnnotation,
  CropBox,
  PageItem,
} from './types/pdf';
import { exportPdfWithAnnotations, appendPdfDocuments } from './utils/pdfHelpers';
import { saveBlobWithDialog } from './utils/fileSave';
import { rotateCropBoxClockwise } from './utils/cropHelpers';
import { rotateAnnotationsClockwise } from './utils/annotationTransform';
import {
  duplicatePdfPageBytes,
  appendBlankPdfPageBytes,
  createPdfFromImageFile,
} from './utils/pdfPageOps';

const MAX_HISTORY_ENTRIES = 50;

const EMPTY_ANNOTATIONS: AnnotationsState = {
  drawings: [],
  shapes: [],
  textboxes: [],
  redactions: [],
  images: [],
};

function cloneAnnotations(a: AnnotationsState): AnnotationsState {
  return JSON.parse(JSON.stringify(a));
}

type ClipboardPayload =
  | { type: 'text'; item: TextBoxAnnotation }
  | { type: 'redaction'; item: RedactionAnnotation }
  | { type: 'image'; item: ImageAnnotation }
  | { type: 'shape'; item: ShapeAnnotation }
  | { type: 'drawing'; item: DrawingAnnotation };

export default function App() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDocProxy, setPdfDocProxy] =
    useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [globalRotation, setGlobalRotation] = useState<number>(0);
  const [pageDimensions, setPageDimensions] = useState<
    Record<number, PageDimension>
  >({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isExtractModalOpen, setIsExtractModalOpen] = useState<boolean>(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState<boolean>(false);

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('vertical');
  const [zoom, setZoom] = useState<number>(1.0);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [drawColor, setDrawColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [drawOpacity, setDrawOpacity] = useState<number>(1.0);
  const [shapeKind, setShapeKind] = useState<ShapeKind>('arrow');
  const [shapeFillEnabled, setShapeFillEnabled] = useState<boolean>(false);
  const [shapeFillColor, setShapeFillColor] = useState<string>('#3b82f6');
  const [redactColor, setRedactColor] = useState<string>('#000000');
  const [redactOpacity, setRedactOpacity] = useState<number>(1.0);
  const [trueRedaction, setTrueRedaction] = useState<boolean>(false);
  const [textColor, setTextColor] = useState<string>('#1e293b');
  const [eyedropperSampledColor, setEyedropperSampledColor] =
    useState<string>('#ef4444');

  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedRedactionId, setSelectedRedactionId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  const [annotations, setAnnotations] = useState<AnnotationsState>(EMPTY_ANNOTATIONS);

  const [globalInvert, setGlobalInvert] = useState<boolean>(false);
  const [pageInverts, setPageInverts] = useState<Record<number, boolean>>({});
  const [crops, setCrops] = useState<Record<number, CropBox>>({});
  const [activeCropSession, setActiveCropSession] = useState<{
    type: 'all' | 'individual';
    pageNumber?: number;
    pendingCrop: CropBox;
    aspectLock: CropAspectLock;
    lockedRatio: number | null;
  } | null>(null);

  const [historyState, setHistoryState] = useState<{
    entries: HistoryEntry[];
    index: number;
  }>({ entries: [], index: -1 });

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [saveCount, setSaveCount] = useState<number>(0);
  const clipboardRef = useRef<ClipboardPayload | null>(null);

  const stateRef = useRef<{
    pages: PageItem[];
    annotations: AnnotationsState;
    pageRotations: Record<number, number>;
    globalRotation: number;
    crops: Record<number, CropBox>;
    pageInverts: Record<number, boolean>;
    globalInvert: boolean;
    trueRedaction: boolean;
  }>({
    pages,
    annotations,
    pageRotations,
    globalRotation,
    crops,
    pageInverts,
    globalInvert,
    trueRedaction,
  });
  stateRef.current = {
    pages,
    annotations,
    pageRotations,
    globalRotation,
    crops,
    pageInverts,
    globalInvert,
    trueRedaction,
  };

  const clearSelections = useCallback(() => {
    setSelectedTextId(null);
    setSelectedRedactionId(null);
    setSelectedImageId(null);
    setSelectedShapeId(null);
    setSelectedDrawingId(null);
  }, []);

  const recordHistory = useCallback(
    (
      newAnnotations: AnnotationsState,
      newRotations: Record<number, number>,
      newGlobalRot: number,
      description = 'Edit',
      newCrops?: Record<number, CropBox>,
      newPageInverts?: Record<number, boolean>,
      newGlobalInv?: boolean,
      newPages?: PageItem[],
      newTrueRedaction?: boolean
    ) => {
      const snap = stateRef.current;
      const entry: HistoryEntry = {
        pages: (newPages ?? snap.pages).map((p) => ({ ...p })),
        annotations: cloneAnnotations(newAnnotations),
        pageRotations: { ...newRotations },
        globalRotation: newGlobalRot,
        crops: { ...(newCrops ?? snap.crops) },
        pageInverts: { ...(newPageInverts ?? snap.pageInverts) },
        globalInvert: newGlobalInv ?? snap.globalInvert,
        trueRedaction: newTrueRedaction ?? snap.trueRedaction,
        description,
      };

      setHistoryState((prev) => {
        const sliced = prev.entries.slice(0, prev.index + 1);
        const nextEntries = [...sliced, entry];
        if (nextEntries.length > MAX_HISTORY_ENTRIES) {
          nextEntries.shift();
        }
        return {
          entries: nextEntries,
          index: nextEntries.length - 1,
        };
      });
    },
    []
  );

  const commitCurrentHistory = useCallback(
    (description = 'Edit') => {
      const s = stateRef.current;
      recordHistory(
        s.annotations,
        s.pageRotations,
        s.globalRotation,
        description,
        s.crops,
        s.pageInverts,
        s.globalInvert,
        s.pages,
        s.trueRedaction
      );
    },
    [recordHistory]
  );

  const applyHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      const cloned = cloneAnnotations({
        ...EMPTY_ANNOTATIONS,
        ...entry.annotations,
        shapes: entry.annotations.shapes || [],
      });
      setAnnotations(cloned);
      setPageRotations({ ...entry.pageRotations });
      setGlobalRotation(entry.globalRotation);
      setCrops(entry.crops ? { ...entry.crops } : {});
      setPageInverts(entry.pageInverts ? { ...entry.pageInverts } : {});
      setGlobalInvert(Boolean(entry.globalInvert));
      setTrueRedaction(Boolean(entry.trueRedaction));
      if (entry.pages) {
        setPages(entry.pages.map((p) => ({ ...p })));
      }
      clearSelections();
    },
    [clearSelections]
  );

  const handleUndo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index <= 0) return prev;
      const nextIndex = prev.index - 1;
      applyHistoryEntry(prev.entries[nextIndex]);
      return { ...prev, index: nextIndex };
    });
  }, [applyHistoryEntry]);

  const handleRedo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index >= prev.entries.length - 1) return prev;
      const nextIndex = prev.index + 1;
      applyHistoryEntry(prev.entries[nextIndex]);
      return { ...prev, index: nextIndex };
    });
  }, [applyHistoryEntry]);

  const loadPdfBytes = useCallback(
    async (bytes: Uint8Array, name: string) => {
      try {
        if (pdfDocProxy) {
          pdfDocProxy.destroy().catch(() => {});
        }

        setPdfBytes(bytes);
        setFileName(name);
        clearSelections();
        setActiveCropSession(null);
        setIsExtractModalOpen(false);
        setPageDimensions({});

        const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
        const doc = await loadingTask.promise;
        setPdfDocProxy(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);

        const initialPages: PageItem[] = Array.from(
          { length: doc.numPages },
          (_, i) => ({
            id: `page-${i + 1}`,
            pdfPageNum: i + 1,
            label: `Page ${i + 1}`,
          })
        );
        setPages(initialPages);

        setAnnotations(EMPTY_ANNOTATIONS);
        setPageRotations({});
        setGlobalRotation(0);
        setThumbnailUrls({});
        setGlobalInvert(false);
        setPageInverts({});
        setCrops({});
        setTrueRedaction(false);

        setHistoryState({
          entries: [
            {
              pages: initialPages,
              annotations: EMPTY_ANNOTATIONS,
              pageRotations: {},
              globalRotation: 0,
              crops: {},
              pageInverts: {},
              globalInvert: false,
              trueRedaction: false,
              description: 'Loaded Document',
            },
          ],
          index: 0,
        });
      } catch (err) {
        console.error('Failed to load PDF document:', err);
      }
    },
    [pdfDocProxy, clearSelections]
  );

  // Page Deletion, Reordering, Duplication & Blank Page Creation
  const handleDeletePage = useCallback(
    (pageId: string) => {
      const snap = stateRef.current;
      if (snap.pages.length <= 1) return;
      const targetPage = snap.pages.find((p) => p.id === pageId);
      const nextPages = snap.pages.filter((p) => p.id !== pageId);

      setPages(nextPages);
      if (targetPage) {
        if (currentPage === targetPage.pdfPageNum && nextPages[0]) {
          setCurrentPage(nextPages[0].pdfPageNum);
        }
        if (
          activeCropSession?.type === 'individual' &&
          activeCropSession.pageNumber === targetPage.pdfPageNum
        ) {
          setActiveCropSession(null);
        }
      }

      recordHistory(
        snap.annotations,
        snap.pageRotations,
        snap.globalRotation,
        `Delete ${targetPage?.label || 'Page'}`,
        snap.crops,
        snap.pageInverts,
        snap.globalInvert,
        nextPages
      );
    },
    [currentPage, activeCropSession, recordHistory]
  );

  const handleReorderPages = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      const snap = stateRef.current;
      if (
        sourceIndex === targetIndex ||
        sourceIndex < 0 ||
        targetIndex < 0 ||
        sourceIndex >= snap.pages.length ||
        targetIndex >= snap.pages.length
      ) {
        return;
      }
      const nextPages = [...snap.pages];
      const [moved] = nextPages.splice(sourceIndex, 1);
      nextPages.splice(targetIndex, 0, moved);
      setPages(nextPages);

      recordHistory(
        snap.annotations,
        snap.pageRotations,
        snap.globalRotation,
        'Reorder Pages',
        snap.crops,
        snap.pageInverts,
        snap.globalInvert,
        nextPages
      );
    },
    [recordHistory]
  );

  const handleDuplicatePage = useCallback(
    async (displayIndex: number) => {
      if (!pdfBytes) return;
      const snap = stateRef.current;
      const sourceItem = snap.pages[displayIndex];
      if (!sourceItem) return;

      try {
        const { bytes: nextBytes, newPageNum } = await duplicatePdfPageBytes(
          pdfBytes,
          sourceItem.pdfPageNum
        );
        const loadingTask = pdfjsLib.getDocument({ data: nextBytes.slice() });
        const newDocProxy = await loadingTask.promise;

        if (pdfDocProxy) {
          pdfDocProxy.destroy().catch(() => {});
        }

        const srcNum = sourceItem.pdfPageNum;
        const newItem: PageItem = {
          id: `page-${newPageNum}-${Date.now()}`,
          pdfPageNum: newPageNum,
          label: `${sourceItem.label} Copy`,
        };

        const nextPages = [...snap.pages];
        nextPages.splice(displayIndex + 1, 0, newItem);

        // Clone source page's annotations, rotation, crop, and invert independently
        const cloneId = (prefix: string) =>
          `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const nextAnnotations: AnnotationsState = {
          drawings: [
            ...snap.annotations.drawings,
            ...snap.annotations.drawings
              .filter((d) => d.page === srcNum)
              .map((d) => ({ ...d, id: cloneId('draw'), page: newPageNum, points: d.points.map((p) => ({ ...p })) })),
          ],
          shapes: [
            ...(snap.annotations.shapes || []),
            ...(snap.annotations.shapes || [])
              .filter((s) => s.page === srcNum)
              .map((s) => ({ ...s, id: cloneId('shape'), page: newPageNum })),
          ],
          textboxes: [
            ...snap.annotations.textboxes,
            ...snap.annotations.textboxes
              .filter((t) => t.page === srcNum)
              .map((t) => ({
                ...t,
                id: cloneId('text'),
                page: newPageNum,
                maskRect: t.maskRect ? { ...t.maskRect } : undefined,
              })),
          ],
          redactions: [
            ...snap.annotations.redactions,
            ...snap.annotations.redactions
              .filter((r) => r.page === srcNum)
              .map((r) => ({
                ...r,
                id: cloneId('fill'),
                page: newPageNum,
                points: r.points ? r.points.map((p) => ({ ...p })) : undefined,
              })),
          ],
          images: [
            ...snap.annotations.images,
            ...snap.annotations.images
              .filter((img) => img.page === srcNum)
              .map((img) => ({ ...img, id: cloneId('img'), page: newPageNum })),
          ],
        };

        const nextRotations = { ...snap.pageRotations };
        if (snap.pageRotations[srcNum] !== undefined) {
          nextRotations[newPageNum] = snap.pageRotations[srcNum];
        }

        const nextCrops = { ...snap.crops };
        if (snap.crops[srcNum]) {
          nextCrops[newPageNum] = { ...snap.crops[srcNum] };
        }

        const nextInverts = { ...snap.pageInverts };
        if (snap.pageInverts[srcNum] !== undefined) {
          nextInverts[newPageNum] = snap.pageInverts[srcNum];
        }

        setPdfBytes(nextBytes);
        setPdfDocProxy(newDocProxy);
        setNumPages(newDocProxy.numPages);
        setPages(nextPages);
        setAnnotations(nextAnnotations);
        setPageRotations(nextRotations);
        setCrops(nextCrops);
        setPageInverts(nextInverts);
        if (thumbnailUrls[srcNum]) {
          setThumbnailUrls((prev) => ({ ...prev, [newPageNum]: thumbnailUrls[srcNum] }));
        }
        setCurrentPage(newPageNum);

        recordHistory(
          nextAnnotations,
          nextRotations,
          snap.globalRotation,
          `Duplicate ${sourceItem.label}`,
          nextCrops,
          nextInverts,
          snap.globalInvert,
          nextPages
        );
      } catch (err) {
        console.error('Failed to duplicate page:', err);
      }
    },
    [pdfBytes, pdfDocProxy, thumbnailUrls, recordHistory]
  );

  const handleInsertBlankPage = useCallback(async () => {
    if (!pdfBytes) return;
    const snap = stateRef.current;
    const curDim = pageDimensions[currentPage] || { width: 612, height: 792 };

    try {
      const { bytes: nextBytes, newPageNum } = await appendBlankPdfPageBytes(
        pdfBytes,
        curDim.width,
        curDim.height
      );
      const loadingTask = pdfjsLib.getDocument({ data: nextBytes.slice() });
      const newDocProxy = await loadingTask.promise;

      if (pdfDocProxy) {
        pdfDocProxy.destroy().catch(() => {});
      }

      const newItem: PageItem = {
        id: `page-blank-${newPageNum}-${Date.now()}`,
        pdfPageNum: newPageNum,
        label: `Blank Page`,
      };

      const curIdx = snap.pages.findIndex((p) => p.pdfPageNum === currentPage);
      const insertAt = curIdx >= 0 ? curIdx + 1 : snap.pages.length;
      const nextPages = [...snap.pages];
      nextPages.splice(insertAt, 0, newItem);

      setPdfBytes(nextBytes);
      setPdfDocProxy(newDocProxy);
      setNumPages(newDocProxy.numPages);
      setPages(nextPages);
      setCurrentPage(newPageNum);

      recordHistory(
        snap.annotations,
        snap.pageRotations,
        snap.globalRotation,
        'Insert Blank Page',
        snap.crops,
        snap.pageInverts,
        snap.globalInvert,
        nextPages
      );

      setTimeout(() => {
        document
          .getElementById(`pdf-page-${newPageNum}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    } catch (err) {
      console.error('Failed to insert blank page:', err);
    }
  }, [pdfBytes, pdfDocProxy, currentPage, pageDimensions, recordHistory]);

  // Annotation Mutation Handlers
  const handleAddDrawing = (drawing: DrawingAnnotation) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      drawings: [...snap.annotations.drawings, drawing],
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Add Drawing');
  };

  const handleDeleteDrawing = useCallback(
    (id: string) => {
      const snap = stateRef.current;
      const exists = snap.annotations.drawings.some((d) => d.id === id);
      if (!exists) return;
      const next: AnnotationsState = {
        ...snap.annotations,
        drawings: snap.annotations.drawings.filter((d) => d.id !== id),
      };
      stateRef.current.annotations = next;
      setAnnotations(next);
      if (selectedDrawingId === id) setSelectedDrawingId(null);
      recordHistory(next, snap.pageRotations, snap.globalRotation, 'Erase Stroke');
    },
    [selectedDrawingId, recordHistory]
  );

  const handleAddShape = (shape: ShapeAnnotation) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      shapes: [...(snap.annotations.shapes || []), shape],
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    clearSelections();
    setSelectedShapeId(shape.id);
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Add Shape');
  };

  const handleUpdateShape = (
    id: string,
    updated: Partial<ShapeAnnotation>,
    commit = false
  ) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      shapes: (snap.annotations.shapes || []).map((s) =>
        s.id === id ? { ...s, ...updated } : s
      ),
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    if (commit) {
      recordHistory(next, snap.pageRotations, snap.globalRotation, 'Update Shape');
    }
  };

  const handleDeleteShape = useCallback(
    (id: string) => {
      const snap = stateRef.current;
      const exists = (snap.annotations.shapes || []).some((s) => s.id === id);
      if (!exists) return;
      const next: AnnotationsState = {
        ...snap.annotations,
        shapes: (snap.annotations.shapes || []).filter((s) => s.id !== id),
      };
      stateRef.current.annotations = next;
      setAnnotations(next);
      if (selectedShapeId === id) setSelectedShapeId(null);
      recordHistory(next, snap.pageRotations, snap.globalRotation, 'Delete Shape');
    },
    [selectedShapeId, recordHistory]
  );

  const handleAddTextBox = (box: TextBoxAnnotation) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      textboxes: [...snap.annotations.textboxes, box],
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    clearSelections();
    setSelectedTextId(box.id);
    setToolMode('select');
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Add Text Box');
  };

  const handleUpdateTextBox = (
    id: string,
    updated: Partial<TextBoxAnnotation>,
    commit = false
  ) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      textboxes: snap.annotations.textboxes.map((t) =>
        t.id === id ? { ...t, ...updated } : t
      ),
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    if (commit) {
      recordHistory(next, snap.pageRotations, snap.globalRotation, 'Update Text Style');
    }
  };

  const handleDeleteSelectedText = useCallback(() => {
    if (!selectedTextId) return;
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      textboxes: snap.annotations.textboxes.filter((t) => t.id !== selectedTextId),
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    setSelectedTextId(null);
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Delete Text');
  }, [selectedTextId, recordHistory]);

  const handleAddRedaction = (redaction: RedactionAnnotation) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      redactions: [...snap.annotations.redactions, redaction],
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Add Fill Region');
  };

  const handleUpdateRedaction = (
    id: string,
    updated: Partial<RedactionAnnotation>,
    commit = false
  ) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      redactions: snap.annotations.redactions.map((r) =>
        r.id === id ? { ...r, ...updated } : r
      ),
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    if (commit) {
      recordHistory(next, snap.pageRotations, snap.globalRotation, 'Update Fill Region');
    }
  };

  const handleDeleteSelectedRedaction = useCallback(() => {
    if (!selectedRedactionId) return;
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      redactions: snap.annotations.redactions.filter(
        (r) => r.id !== selectedRedactionId
      ),
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    setSelectedRedactionId(null);
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Delete Fill Region');
  }, [selectedRedactionId, recordHistory]);

  const handleAddImage = (image: ImageAnnotation) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      images: [...snap.annotations.images, image],
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
    clearSelections();
    setSelectedImageId(image.id);
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Add Image');
  };

  const handleUpdateImage = (id: string, updated: Partial<ImageAnnotation>) => {
    const snap = stateRef.current;
    const next: AnnotationsState = {
      ...snap.annotations,
      images: snap.annotations.images.map((img) =>
        img.id === id ? { ...img, ...updated } : img
      ),
    };
    stateRef.current.annotations = next;
    setAnnotations(next);
  };

  const handleDeleteImage = useCallback(
    (id: string) => {
      const snap = stateRef.current;
      const next: AnnotationsState = {
        ...snap.annotations,
        images: snap.annotations.images.filter((img) => img.id !== id),
      };
      stateRef.current.annotations = next;
      setAnnotations(next);
      if (selectedImageId === id) setSelectedImageId(null);
      recordHistory(next, snap.pageRotations, snap.globalRotation, 'Delete Image');
    },
    [selectedImageId, recordHistory]
  );

  // Copy & Paste Selected Annotations (Ctrl+C / Ctrl+V)
  const handleCopySelected = useCallback(() => {
    const snap = stateRef.current;
    if (selectedTextId) {
      const item = snap.annotations.textboxes.find((t) => t.id === selectedTextId);
      if (item) clipboardRef.current = { type: 'text', item: JSON.parse(JSON.stringify(item)) };
    } else if (selectedRedactionId) {
      const item = snap.annotations.redactions.find((r) => r.id === selectedRedactionId);
      if (item) clipboardRef.current = { type: 'redaction', item: JSON.parse(JSON.stringify(item)) };
    } else if (selectedImageId) {
      const item = snap.annotations.images.find((i) => i.id === selectedImageId);
      if (item) clipboardRef.current = { type: 'image', item: JSON.parse(JSON.stringify(item)) };
    } else if (selectedShapeId) {
      const item = (snap.annotations.shapes || []).find((s) => s.id === selectedShapeId);
      if (item) clipboardRef.current = { type: 'shape', item: JSON.parse(JSON.stringify(item)) };
    } else if (selectedDrawingId) {
      const item = snap.annotations.drawings.find((d) => d.id === selectedDrawingId);
      if (item) clipboardRef.current = { type: 'drawing', item: JSON.parse(JSON.stringify(item)) };
    }
  }, [
    selectedTextId,
    selectedRedactionId,
    selectedImageId,
    selectedShapeId,
    selectedDrawingId,
  ]);

  const handlePasteAnnotation = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload || numPages <= 0) return;
    const snap = stateRef.current;
    const offset = 16;
    const newId = `${payload.type}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    let next: AnnotationsState = snap.annotations;
    clearSelections();

    if (payload.type === 'text') {
      const copy: TextBoxAnnotation = {
        ...payload.item,
        id: newId,
        page: currentPage,
        x: payload.item.x + offset,
        y: payload.item.y + offset,
        maskRect: payload.item.maskRect
          ? {
              ...payload.item.maskRect,
              x: payload.item.maskRect.x + offset,
              y: payload.item.maskRect.y + offset,
            }
          : undefined,
      };
      next = { ...snap.annotations, textboxes: [...snap.annotations.textboxes, copy] };
      setSelectedTextId(newId);
    } else if (payload.type === 'redaction') {
      const copy: RedactionAnnotation = {
        ...payload.item,
        id: newId,
        page: currentPage,
        x: payload.item.x + offset,
        y: payload.item.y + offset,
        points: payload.item.points?.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      };
      next = { ...snap.annotations, redactions: [...snap.annotations.redactions, copy] };
      setSelectedRedactionId(newId);
    } else if (payload.type === 'image') {
      const copy: ImageAnnotation = {
        ...payload.item,
        id: newId,
        page: currentPage,
        x: payload.item.x + offset,
        y: payload.item.y + offset,
      };
      next = { ...snap.annotations, images: [...snap.annotations.images, copy] };
      setSelectedImageId(newId);
    } else if (payload.type === 'shape') {
      const copy: ShapeAnnotation = {
        ...payload.item,
        id: newId,
        page: currentPage,
        x1: payload.item.x1 + offset,
        y1: payload.item.y1 + offset,
        x2: payload.item.x2 + offset,
        y2: payload.item.y2 + offset,
      };
      next = {
        ...snap.annotations,
        shapes: [...(snap.annotations.shapes || []), copy],
      };
      setSelectedShapeId(newId);
    } else if (payload.type === 'drawing') {
      const copy: DrawingAnnotation = {
        ...payload.item,
        id: newId,
        page: currentPage,
        points: payload.item.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      };
      next = { ...snap.annotations, drawings: [...snap.annotations.drawings, copy] };
      setSelectedDrawingId(newId);
    }

    setAnnotations(next);
    setToolMode('select');
    recordHistory(next, snap.pageRotations, snap.globalRotation, 'Paste Annotation');
  }, [currentPage, numPages, clearSelections, recordHistory]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (
          selectedTextId ||
          selectedRedactionId ||
          selectedImageId ||
          selectedShapeId ||
          selectedDrawingId
        ) {
          e.preventDefault();
          handleCopySelected();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current) {
          e.preventDefault();
          handlePasteAnnotation();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTextId) {
          e.preventDefault();
          handleDeleteSelectedText();
        } else if (selectedRedactionId) {
          e.preventDefault();
          handleDeleteSelectedRedaction();
        } else if (selectedImageId) {
          e.preventDefault();
          handleDeleteImage(selectedImageId);
        } else if (selectedShapeId) {
          e.preventDefault();
          handleDeleteShape(selectedShapeId);
        } else if (selectedDrawingId) {
          e.preventDefault();
          handleDeleteDrawing(selectedDrawingId);
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'v') setToolMode('select');
        else if (key === 'h') setToolMode('hand');
        else if (key === 't') setToolMode('text');
        else if (key === 'p') setToolMode('draw');
        else if (key === 'l') setToolMode('highlighter');
        else if (key === 's') setToolMode('shape');
        else if (key === 'e') setToolMode('eraser');
        else if (key === 'r') setToolMode('redact');
        else if (e.key === 'Escape') {
          clearSelections();
          setToolMode('select');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleCopySelected,
    handlePasteAnnotation,
    handleDeleteSelectedText,
    handleDeleteSelectedRedaction,
    handleDeleteImage,
    handleDeleteShape,
    handleDeleteDrawing,
    clearSelections,
    selectedTextId,
    selectedRedactionId,
    selectedImageId,
    selectedShapeId,
    selectedDrawingId,
  ]);

  // Image Upload File Handler
  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width || 200;
        const h = img.naturalHeight || img.height || 200;
        const maxWidth = 240;
        const aspect = h / Math.max(1, w);
        const newWidth = Math.min(maxWidth, w);
        const newHeight = newWidth * aspect;

        const isJpeg =
          file.type === 'image/jpeg' || rawDataUrl.startsWith('data:image/jpeg');
        const isPng =
          file.type === 'image/png' || rawDataUrl.startsWith('data:image/png');

        let finalDataUrl = rawDataUrl;
        let mimeType: 'image/png' | 'image/jpeg' = isJpeg ? 'image/jpeg' : 'image/png';

        if (!isJpeg && !isPng) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              finalDataUrl = canvas.toDataURL('image/png');
              mimeType = 'image/png';
            }
          } catch {
            // Keep original if canvas rasterization fails
          }
        }

        const newImageAnnotation: ImageAnnotation = {
          id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          page: currentPage,
          x: 60,
          y: 60,
          width: Math.round(newWidth),
          height: Math.round(newHeight),
          rotation: 0,
          dataUrl: finalDataUrl,
          mimeType,
        };

        handleAddImage(newImageAnnotation);
        setToolMode('select');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleInsertSignature = (dataUrl: string, width: number, height: number) => {
    const dim = pageDimensions[currentPage] || { width: 612, height: 792 };
    const sigAnnotation: ImageAnnotation = {
      id: `sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      page: currentPage,
      x: Math.max(20, Math.round(dim.width / 2 - width / 2)),
      y: Math.max(20, Math.round(dim.height / 2 - height / 2)),
      width,
      height,
      rotation: 0,
      dataUrl,
      mimeType: 'image/png',
    };
    handleAddImage(sigAnnotation);
    setToolMode('select');
  };

  // Rotation Handlers (rotate both crop boxes AND all annotations on target pages)
  const handleIndividualPageRotate = (pageNumber: number) => {
    const snap = stateRef.current;
    const currentRot = snap.pageRotations[pageNumber] || 0;
    const nextRot = (currentRot + 90) % 360;
    const nextRotations = { ...snap.pageRotations, [pageNumber]: nextRot };
    setPageRotations(nextRotations);

    const nextAnnotations = rotateAnnotationsClockwise(
      snap.annotations,
      new Set([pageNumber]),
      pageDimensions
    );
    setAnnotations(nextAnnotations);

    setPageDimensions((prev) => {
      const existing = prev[pageNumber];
      if (!existing) return prev;
      return {
        ...prev,
        [pageNumber]: {
          ...existing,
          width: existing.height,
          height: existing.width,
        },
      };
    });

    let nextCrops = snap.crops;
    if (snap.crops[pageNumber]) {
      nextCrops = {
        ...snap.crops,
        [pageNumber]: rotateCropBoxClockwise(snap.crops[pageNumber]),
      };
      setCrops(nextCrops);
    }

    recordHistory(
      nextAnnotations,
      nextRotations,
      snap.globalRotation,
      `Rotate Page ${pageNumber}`,
      nextCrops
    );
  };

  const handleGlobalRotate = () => {
    const snap = stateRef.current;
    const nextGlobal = (snap.globalRotation + 90) % 360;
    setGlobalRotation(nextGlobal);

    const activeNums = new Set<number>(snap.pages.map((p) => p.pdfPageNum));
    const nextAnnotations = rotateAnnotationsClockwise(
      snap.annotations,
      activeNums,
      pageDimensions
    );
    setAnnotations(nextAnnotations);

    setPageDimensions((prev) => {
      const updated = { ...prev };
      for (const k of Object.keys(updated)) {
        const num = Number(k);
        if (activeNums.has(num)) {
          updated[num] = {
            ...updated[num],
            width: updated[num].height,
            height: updated[num].width,
          };
        }
      }
      return updated;
    });

    let nextCrops = snap.crops;
    if (Object.keys(snap.crops).length > 0) {
      nextCrops = {};
      for (const [key, cropBox] of Object.entries(snap.crops)) {
        if (cropBox) {
          nextCrops[Number(key)] = rotateCropBoxClockwise(cropBox as CropBox);
        }
      }
      setCrops(nextCrops);
    }

    recordHistory(
      nextAnnotations,
      snap.pageRotations,
      nextGlobal,
      'Rotate All Pages',
      nextCrops
    );
  };

  // True Dynamic Fit-Width & Fit-Page
  const handleFitWidth = useCallback(() => {
    const container = viewportRef.current;
    const dim = pageDimensions[currentPage];
    if (!container || !dim || dim.width <= 0) {
      setZoom(1.2);
      return;
    }
    const availW = Math.max(200, container.clientWidth - 72);
    const computed = Math.min(3.0, Math.max(0.3, Number((availW / dim.width).toFixed(2))));
    setZoom(computed);
  }, [currentPage, pageDimensions]);

  const handleFitPage = useCallback(() => {
    const container = viewportRef.current;
    const dim = pageDimensions[currentPage];
    if (!container || !dim || dim.width <= 0 || dim.height <= 0) {
      setZoom(0.85);
      return;
    }
    const availW = Math.max(200, container.clientWidth - 72);
    const availH = Math.max(200, container.clientHeight - 72);
    const computed = Math.min(availW / dim.width, availH / dim.height);
    setZoom(Math.min(3.0, Math.max(0.3, Number(computed.toFixed(2)))));
  }, [currentPage, pageDimensions]);

  const previousToolRef = useRef<ToolMode>('redact');

  const handleActivateEyeDropper = async () => {
    previousToolRef.current = toolMode === 'eyedropper' ? 'redact' : toolMode;
    if ('EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          const hex = result.sRGBHex;
          setEyedropperSampledColor(hex);
          setDrawColor(hex);
          setTextColor(hex);
          setRedactColor(hex);
          if (selectedRedactionId) {
            handleUpdateRedaction(selectedRedactionId, { fillColor: hex }, true);
          } else if (selectedTextId) {
            handleUpdateTextBox(selectedTextId, { color: hex }, true);
          } else if (selectedShapeId) {
            handleUpdateShape(selectedShapeId, { color: hex }, true);
          }
        }
      } catch {
        // Cancelled
      }
    } else {
      setToolMode('eyedropper');
    }
  };

  const handleColorSampledFromCanvas = (sampled: string) => {
    setEyedropperSampledColor(sampled);
    setDrawColor(sampled);
    setTextColor(sampled);
    setRedactColor(sampled);
    if (selectedRedactionId) {
      handleUpdateRedaction(selectedRedactionId, { fillColor: sampled }, true);
    } else if (selectedTextId) {
      handleUpdateTextBox(selectedTextId, { color: sampled }, true);
    } else if (selectedShapeId) {
      handleUpdateShape(selectedShapeId, { color: sampled }, true);
    }
    if (toolMode === 'eyedropper') {
      setToolMode(previousToolRef.current || 'redact');
    }
  };

  const handleReportDimension = useCallback((dim: PageDimension) => {
    setPageDimensions((prev) => {
      const existing = prev[dim.pageNumber];
      if (
        existing &&
        existing.width === dim.width &&
        existing.height === dim.height &&
        existing.originalRotation === dim.originalRotation
      ) {
        return prev;
      }
      return { ...prev, [dim.pageNumber]: dim };
    });
  }, []);

  const handleReportThumbnail = useCallback((pageNumber: number, url: string) => {
    setThumbnailUrls((prev) => ({ ...prev, [pageNumber]: url }));
  }, []);

  // File Ingestion Handler (PDF or Image-to-PDF starter when empty)
  const handleOpenFile = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (isImage) {
      if (!pdfBytes || numPages === 0) {
        try {
          const starterBytes = await createPdfFromImageFile(file);
          const starterName = file.name.replace(/\.[^/.]+$/, '') + '.pdf';
          await loadPdfBytes(starterBytes, starterName);
        } catch (err) {
          console.error('Failed to create PDF from image:', err);
        }
      } else {
        handleImageUpload(file);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;
      const incomingBytes = new Uint8Array(buffer);

      if (pdfBytes && numPages > 0) {
        try {
          const mergedBytes = await appendPdfDocuments(pdfBytes, incomingBytes);
          const loadingTask = pdfjsLib.getDocument({ data: mergedBytes.slice() });
          const newDocProxy = await loadingTask.promise;

          if (pdfDocProxy) {
            pdfDocProxy.destroy().catch(() => {});
          }

          const oldPageCount = numPages;
          const newTotalPages = newDocProxy.numPages;
          const addedCount = newTotalPages - oldPageCount;

          const appendedItems: PageItem[] = Array.from(
            { length: addedCount },
            (_, i) => {
              const actualPdfNum = oldPageCount + i + 1;
              return {
                id: `page-${actualPdfNum}-${Date.now()}`,
                pdfPageNum: actualPdfNum,
                label: `Page ${actualPdfNum}`,
              };
            }
          );

          const nextPages = [...pages, ...appendedItems];
          setPdfBytes(mergedBytes);
          setPdfDocProxy(newDocProxy);
          setNumPages(newTotalPages);
          setPages(nextPages);

          recordHistory(
            annotations,
            pageRotations,
            globalRotation,
            `Appended ${file.name}`,
            crops,
            pageInverts,
            globalInvert,
            nextPages
          );
        } catch (err) {
          console.error('Failed to append PDF:', err);
        }
      } else {
        loadPdfBytes(incomingBytes, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDropFile = (file: File) => {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      handleOpenFile(file);
    } else if (file.type.startsWith('image/')) {
      handleOpenFile(file);
    }
  };

  const handleExportPdf = async () => {
    if (!pdfBytes) return;
    try {
      setIsExporting(true);
      const exportedBytes = await exportPdfWithAnnotations(
        pdfBytes,
        annotations,
        pageRotations,
        globalRotation,
        pageDimensions,
        crops,
        pageInverts,
        globalInvert,
        pages,
        trueRedaction
      );

      const blob = new Blob([exportedBytes], { type: 'application/pdf' });
      const suggestedName = fileName.replace(/\.pdf$/i, '') + '_edited.pdf';
      const saved = await saveBlobWithDialog(blob, suggestedName);
      if (saved) {
        setSaveCount((c) => c + 1);
      }
    } catch (err) {
      console.error('Error during PDF export:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleGlobalInvert = () => {
    const snap = stateRef.current;
    const next = !snap.globalInvert;
    setGlobalInvert(next);
    recordHistory(
      snap.annotations,
      snap.pageRotations,
      snap.globalRotation,
      'Toggle Invert All',
      snap.crops,
      snap.pageInverts,
      next
    );
  };

  const handleToggleCurrentPageInvert = () => {
    const snap = stateRef.current;
    const nextInverts = {
      ...snap.pageInverts,
      [currentPage]: !snap.pageInverts[currentPage],
    };
    setPageInverts(nextInverts);
    recordHistory(
      snap.annotations,
      snap.pageRotations,
      snap.globalRotation,
      `Toggle Invert Page ${currentPage}`,
      snap.crops,
      nextInverts,
      snap.globalInvert
    );
  };

  const handleTogglePageInvert = (pageNum: number) => {
    const snap = stateRef.current;
    const nextInverts = {
      ...snap.pageInverts,
      [pageNum]: !snap.pageInverts[pageNum],
    };
    setPageInverts(nextInverts);
    recordHistory(
      snap.annotations,
      snap.pageRotations,
      snap.globalRotation,
      `Toggle Invert Page ${pageNum}`,
      snap.crops,
      nextInverts,
      snap.globalInvert
    );
  };

  const handleToggleTrueRedaction = () => {
    const snap = stateRef.current;
    const next = !snap.trueRedaction;
    setTrueRedaction(next);
    recordHistory(
      snap.annotations,
      snap.pageRotations,
      snap.globalRotation,
      'Toggle True Redaction',
      snap.crops,
      snap.pageInverts,
      snap.globalInvert,
      snap.pages,
      next
    );
  };

  // Crop Handlers
  const handleApplyCrop = (pageNumbers: number[], crop: CropBox) => {
    const snap = stateRef.current;
    const nextCrops = { ...snap.crops };
    pageNumbers.forEach((p) => {
      if (
        crop.x <= 0.001 &&
        crop.y <= 0.001 &&
        crop.width >= 0.999 &&
        crop.height >= 0.999
      ) {
        delete nextCrops[p];
      } else {
        nextCrops[p] = crop;
      }
    });
    setCrops(nextCrops);
    recordHistory(
      snap.annotations,
      snap.pageRotations,
      snap.globalRotation,
      'Apply Crop',
      nextCrops,
      snap.pageInverts,
      snap.globalInvert
    );
  };

  const handleStartAllPageCrop = () => {
    if (pages.length <= 0) return;
    const firstPageNum = pages[0].pdfPageNum;
    const initial = crops[firstPageNum] || { x: 0, y: 0, width: 1, height: 1 };
    setActiveCropSession({
      type: 'all',
      pendingCrop: { ...initial },
      aspectLock: 'free',
      lockedRatio: null,
    });
  };

  const handleStartIndividualCrop = (pageNum: number) => {
    if (pages.length <= 0) return;
    const targetPage = Math.max(1, Math.min(numPages, pageNum));
    setCurrentPage(targetPage);
    const initial = crops[targetPage] || { x: 0, y: 0, width: 1, height: 1 };
    setActiveCropSession({
      type: 'individual',
      pageNumber: targetPage,
      pendingCrop: { ...initial },
      aspectLock: 'free',
      lockedRatio: null,
    });
    setTimeout(() => {
      document
        .getElementById(`pdf-page-${targetPage}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleCropChange = (newCrop: CropBox) => {
    setActiveCropSession((prev) => {
      if (!prev) return null;
      return { ...prev, pendingCrop: newCrop };
    });
  };

  const handleCropAspectLockChange = (
    lock: CropAspectLock,
    ratio: number | null
  ) => {
    setActiveCropSession((prev) => {
      if (!prev) return null;
      if (!ratio) {
        return { ...prev, aspectLock: lock, lockedRatio: null };
      }

      const refPageNum =
        prev.type === 'individual' && prev.pageNumber
          ? prev.pageNumber
          : pages[0]?.pdfPageNum || currentPage;
      const dim = pageDimensions[refPageNum] || { width: 612, height: 792 };
      const pageAspect = dim.width / Math.max(1, dim.height);
      const normRatio = ratio / pageAspect;

      const c = prev.pendingCrop;
      const cx = c.x + c.width / 2;
      const cy = c.y + c.height / 2;

      let nextW = c.width;
      let nextH = nextW / normRatio;
      if (nextH > 1) {
        nextH = 1;
        nextW = nextH * normRatio;
      }
      if (nextW > 1) {
        nextW = 1;
        nextH = nextW / normRatio;
      }

      const nextX = Math.max(0, Math.min(1 - nextW, cx - nextW / 2));
      const nextY = Math.max(0, Math.min(1 - nextH, cy - nextH / 2));

      return {
        ...prev,
        aspectLock: lock,
        lockedRatio: ratio,
        pendingCrop: {
          x: Number(nextX.toFixed(4)),
          y: Number(nextY.toFixed(4)),
          width: Number(Math.max(0.05, nextW).toFixed(4)),
          height: Number(Math.max(0.05, nextH).toFixed(4)),
        },
      };
    });
  };

  const handleApplyActiveCrop = () => {
    if (!activeCropSession) return;
    if (activeCropSession.type === 'all') {
      const activePageNums = pages.map((p) => p.pdfPageNum);
      handleApplyCrop(activePageNums, activeCropSession.pendingCrop);
    } else if (activeCropSession.pageNumber) {
      handleApplyCrop([activeCropSession.pageNumber], activeCropSession.pendingCrop);
    }
    setActiveCropSession(null);
  };

  const handleCancelActiveCrop = () => {
    setActiveCropSession(null);
  };

  const handleResetActiveCrop = () => {
    if (!activeCropSession) return;
    setActiveCropSession({
      ...activeCropSession,
      aspectLock: 'free',
      lockedRatio: null,
      pendingCrop: { x: 0, y: 0, width: 1, height: 1 },
    });
  };

  const selectedText =
    annotations.textboxes.find((t) => t.id === selectedTextId) || null;
  const selectedRedaction =
    annotations.redactions.find((r) => r.id === selectedRedactionId) || null;
  const selectedShape =
    (annotations.shapes || []).find((s) => s.id === selectedShapeId) || null;
  const selectedDrawing =
    annotations.drawings.find((d) => d.id === selectedDrawingId) || null;

  return (
    <div
      id="pdf-editor-root"
      className="fixed inset-0 w-screen h-screen overflow-hidden flex flex-col bg-[#0B0D11] text-zinc-100 font-sans"
    >
      <Toolbar
        toolMode={toolMode}
        setToolMode={setToolMode}
        viewMode={viewMode}
        setViewMode={setViewMode}
        zoom={zoom}
        setZoom={setZoom}
        onFitWidth={handleFitWidth}
        onFitPage={handleFitPage}
        onGlobalRotate={handleGlobalRotate}
        onRotateCurrentPage={() => handleIndividualPageRotate(currentPage)}
        canUndo={historyState.index > 0}
        canRedo={historyState.index < historyState.entries.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenFile={handleOpenFile}
        onExportPdf={handleExportPdf}
        isExporting={isExporting}
        saveCount={saveCount}
        onImageUpload={handleImageUpload}
        onOpenSignatureModal={() => {
          if (numPages > 0) setIsSignatureModalOpen(true);
        }}
        fileName={fileName}
        globalInvert={globalInvert}
        onToggleGlobalInvert={handleToggleGlobalInvert}
        isCurrentPageInverted={Boolean(pageInverts[currentPage])}
        onToggleCurrentPageInvert={handleToggleCurrentPageInvert}
        isProcessingInvert={false}
        onStartAllPageCrop={handleStartAllPageCrop}
        onStartIndividualCrop={() => handleStartIndividualCrop(currentPage)}
        isCroppingActive={Boolean(activeCropSession)}
        onOpenExtractModal={() => setIsExtractModalOpen(true)}
      />

      <PropertiesBar
        toolMode={toolMode}
        selectedText={selectedText}
        onUpdateSelectedText={(updated, commit) => {
          if (selectedTextId) handleUpdateTextBox(selectedTextId, updated, commit);
        }}
        onDeleteSelectedText={handleDeleteSelectedText}
        selectedRedaction={selectedRedaction}
        onUpdateSelectedRedaction={(updated, commit) => {
          if (selectedRedactionId)
            handleUpdateRedaction(selectedRedactionId, updated, commit);
        }}
        onDeleteSelectedRedaction={handleDeleteSelectedRedaction}
        selectedShape={selectedShape}
        onUpdateSelectedShape={(updated, commit) => {
          if (selectedShapeId) handleUpdateShape(selectedShapeId, updated, commit);
        }}
        onDeleteSelectedShape={() => {
          if (selectedShapeId) handleDeleteShape(selectedShapeId);
        }}
        selectedDrawing={selectedDrawing}
        onDeleteSelectedDrawing={() => {
          if (selectedDrawingId) handleDeleteDrawing(selectedDrawingId);
        }}
        shapeKind={shapeKind}
        setShapeKind={setShapeKind}
        shapeFillEnabled={shapeFillEnabled}
        setShapeFillEnabled={setShapeFillEnabled}
        shapeFillColor={shapeFillColor}
        setShapeFillColor={setShapeFillColor}
        drawColor={drawColor}
        setDrawColor={setDrawColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        drawOpacity={drawOpacity}
        setDrawOpacity={setDrawOpacity}
        redactColor={redactColor}
        setRedactColor={setRedactColor}
        redactOpacity={redactOpacity}
        setRedactOpacity={setRedactOpacity}
        trueRedaction={trueRedaction}
        onToggleTrueRedaction={handleToggleTrueRedaction}
        textColor={textColor}
        setTextColor={setTextColor}
        onActivateEyeDropper={handleActivateEyeDropper}
        eyedropperSampledColor={eyedropperSampledColor}
        onCommitHistory={commitCurrentHistory}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <SidebarThumbnails
          pages={pages}
          currentPage={currentPage}
          onPageSelect={(page) => {
            setCurrentPage(page);
            document
              .getElementById(`pdf-page-${page}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onRotatePage={handleIndividualPageRotate}
          pageRotations={pageRotations}
          globalRotation={globalRotation}
          thumbnailUrls={thumbnailUrls}
          pageInverts={pageInverts}
          globalInvert={globalInvert}
          crops={crops}
          onTogglePageInvert={handleTogglePageInvert}
          onStartIndividualCrop={handleStartIndividualCrop}
          activeCropPage={
            activeCropSession?.type === 'individual'
              ? activeCropSession.pageNumber
              : null
          }
          onDeletePage={handleDeletePage}
          onDuplicatePage={handleDuplicatePage}
          onInsertBlankPage={handleInsertBlankPage}
          onReorderPages={handleReorderPages}
        />

        <PDFViewerContainer
          viewportRef={viewportRef}
          pdfDocument={pdfDocProxy}
          numPages={numPages}
          pages={pages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          scale={zoom}
          setScale={setZoom}
          toolMode={toolMode}
          shapeKind={shapeKind}
          shapeFillEnabled={shapeFillEnabled}
          shapeFillColor={shapeFillColor}
          viewMode={viewMode}
          pageRotations={pageRotations}
          globalRotation={globalRotation}
          drawings={annotations.drawings}
          shapes={annotations.shapes || []}
          textboxes={annotations.textboxes}
          redactions={annotations.redactions}
          images={annotations.images}
          selectedTextId={selectedTextId}
          onSelectText={setSelectedTextId}
          selectedRedactionId={selectedRedactionId}
          onSelectRedaction={setSelectedRedactionId}
          selectedImageId={selectedImageId}
          onSelectImage={setSelectedImageId}
          selectedShapeId={selectedShapeId}
          onSelectShape={setSelectedShapeId}
          selectedDrawingId={selectedDrawingId}
          onSelectDrawing={setSelectedDrawingId}
          onAddDrawing={handleAddDrawing}
          onDeleteDrawing={handleDeleteDrawing}
          onAddShape={handleAddShape}
          onUpdateShape={handleUpdateShape}
          onDeleteShape={handleDeleteShape}
          onAddTextBox={handleAddTextBox}
          onUpdateTextBox={handleUpdateTextBox}
          onAddRedaction={handleAddRedaction}
          onUpdateRedaction={handleUpdateRedaction}
          onUpdateImage={handleUpdateImage}
          onDeleteImage={handleDeleteImage}
          drawColor={drawColor}
          strokeWidth={strokeWidth}
          drawOpacity={drawOpacity}
          redactColor={redactColor}
          redactOpacity={redactOpacity}
          textColor={textColor}
          onColorSampled={handleColorSampledFromCanvas}
          onReportDimension={handleReportDimension}
          onReportThumbnail={handleReportThumbnail}
          onDropFile={handleDropFile}
          globalInvert={globalInvert}
          pageInverts={pageInverts}
          crops={crops}
          activeCropSession={activeCropSession}
          onCropChange={handleCropChange}
          onCommitHistory={commitCurrentHistory}
        />
      </div>

      <AnimatePresence>
        {activeCropSession && (
          <CropFloatingBar
            type={activeCropSession.type}
            pageNumber={activeCropSession.pageNumber}
            numPages={pages.length}
            pendingCrop={activeCropSession.pendingCrop}
            aspectLock={activeCropSession.aspectLock}
            onAspectLockChange={handleCropAspectLockChange}
            onCropChange={handleCropChange}
            onApply={handleApplyActiveCrop}
            onCancel={handleCancelActiveCrop}
            onReset={handleResetActiveCrop}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSignatureModalOpen && (
          <SignaturePadModal
            isOpen={isSignatureModalOpen}
            onClose={() => setIsSignatureModalOpen(false)}
            onInsert={handleInsertSignature}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExtractModalOpen && (
          <ExtractPagesModal
            isOpen={isExtractModalOpen}
            onClose={() => setIsExtractModalOpen(false)}
            pages={pages}
            thumbnailUrls={thumbnailUrls}
            pageRotations={pageRotations}
            globalRotation={globalRotation}
            pageInverts={pageInverts}
            globalInvert={globalInvert}
            originalPdfBytes={pdfBytes}
            annotations={annotations}
            pageDimensions={pageDimensions}
            crops={crops}
            fileName={fileName}
            trueRedaction={trueRedaction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
