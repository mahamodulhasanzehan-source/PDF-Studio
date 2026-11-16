import { useRef, useState, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderOpen,
  Download,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Undo2,
  Redo2,
  Type,
  PenTool,
  Highlighter,
  PaintBucket,
  Image as ImageIcon,
  Pipette,
  MousePointer2,
  Hand,
  Columns,
  Rows,
  SunMoon,
  Crop,
  ChevronDown,
  Loader2,
  Layers,
  Shapes,
  Eraser,
  PenLine,
  Check,
} from 'lucide-react';
import { ToolMode, ViewMode } from '../types/pdf';

interface ToolbarProps {
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  zoom: number;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onGlobalRotate: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenFile: (file: File) => void;
  onExportPdf: () => void;
  isExporting: boolean;
  saveCount?: number;
  onImageUpload: (file: File) => void;
  onOpenSignatureModal: () => void;
  fileName: string;
  globalInvert: boolean;
  onToggleGlobalInvert: () => void;
  isCurrentPageInverted: boolean;
  onToggleCurrentPageInvert: () => void;
  isProcessingInvert: boolean;
  onRotateCurrentPage?: () => void;
  onStartAllPageCrop: () => void;
  onStartIndividualCrop: () => void;
  isCroppingActive?: boolean;
  onOpenExtractModal?: () => void;
}

export default function Toolbar({
  toolMode,
  setToolMode,
  viewMode,
  setViewMode,
  zoom,
  setZoom,
  onFitWidth,
  onFitPage,
  onGlobalRotate,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenFile,
  onExportPdf,
  isExporting,
  saveCount = 0,
  onImageUpload,
  onOpenSignatureModal,
  fileName,
  globalInvert,
  onToggleGlobalInvert,
  isCurrentPageInverted,
  onToggleCurrentPageInvert,
  isProcessingInvert,
  onRotateCurrentPage,
  onStartAllPageCrop,
  onStartIndividualCrop,
  isCroppingActive,
  onOpenExtractModal,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [showInvertMenu, setShowInvertMenu] = useState(false);
  const invertMenuRef = useRef<HTMLDivElement>(null);
  const [showCropMenu, setShowCropMenu] = useState(false);
  const cropMenuRef = useRef<HTMLDivElement>(null);
  const [showRotateMenu, setShowRotateMenu] = useState(false);
  const rotateMenuRef = useRef<HTMLDivElement>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (saveCount > 0) {
      setJustSaved(true);
      const t = window.setTimeout(() => setJustSaved(false), 1800);
      return () => window.clearTimeout(t);
    }
  }, [saveCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (invertMenuRef.current && !invertMenuRef.current.contains(e.target as Node)) {
        setShowInvertMenu(false);
      }
      if (cropMenuRef.current && !cropMenuRef.current.contains(e.target as Node)) {
        setShowCropMenu(false);
      }
      if (rotateMenuRef.current && !rotateMenuRef.current.contains(e.target as Node)) {
        setShowRotateMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showInvertMenu || showCropMenu || showRotateMenu || showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInvertMenu, showCropMenu, showRotateMenu, showMoreMenu]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onOpenFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const tools: { id: ToolMode | 'signature'; label: string; short: string; icon: any }[] = [
    { id: 'hand', label: 'Hand Tool (H)', short: 'Hand', icon: Hand },
    { id: 'select', label: 'Select / Edit (V)', short: 'Select', icon: MousePointer2 },
    { id: 'text', label: 'Add Text Box (T)', short: 'Text', icon: Type },
    { id: 'draw', label: 'Pen Tool (P)', short: 'Pen', icon: PenTool },
    { id: 'highlighter', label: 'Highlighter (L)', short: 'Highlight', icon: Highlighter },
    { id: 'shape', label: 'Shapes & Arrows (S)', short: 'Shape', icon: Shapes },
    { id: 'eraser', label: 'Stroke Eraser (E)', short: 'Erase', icon: Eraser },
    { id: 'redact', label: 'Fill Region (R)', short: 'Fill', icon: PaintBucket },
    { id: 'signature', label: 'Draw Signature', short: 'Sign', icon: PenLine },
    { id: 'image', label: 'Insert Image', short: 'Image', icon: ImageIcon },
    { id: 'eyedropper', label: 'Color Picker', short: 'Sample', icon: Pipette },
  ];

  return (
    <header
      id="main-toolbar"
      className="relative h-13 bg-[#11141B] border-b border-white/[0.08] text-zinc-100 flex items-center justify-between px-3 gap-2 select-none z-30 shrink-0"
    >
      {/* Subtle animated export progress indicator along toolbar edge */}
      <AnimatePresence>
        {isExporting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500/20 overflow-hidden pointer-events-none"
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
              className="w-1/2 h-full bg-gradient-to-r from-transparent via-blue-400 to-transparent"
            />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Left: Brand & File Operations */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2.5 pr-3 border-r border-white/[0.08]">
          <div className="w-7 h-7 rounded-md bg-blue-600/90 flex items-center justify-center text-white font-bold text-[11px] tracking-tight shrink-0">
            PDF
          </div>
          <div className="hidden md:flex flex-col min-w-0">
            <span className="font-semibold text-xs tracking-tight text-zinc-100 leading-tight whitespace-nowrap">
              PDF Studio
            </span>
            <span
              className="text-[11px] text-zinc-400 truncate max-w-[140px] leading-tight"
              title={fileName || 'No file open'}
            >
              {fileName || 'No file open'}
            </span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={
            fileName
              ? '.pdf,application/pdf'
              : '.pdf,application/pdf,image/png,image/jpeg,image/webp,image/svg+xml'
          }
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleImageChange}
          className="hidden"
        />

        <button
          id="toolbar-open-file"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 text-xs font-medium transition-colors border border-white/[0.08] whitespace-nowrap shrink-0"
          title={fileName ? 'Append another PDF document' : 'Open PDF or convert image to PDF'}
        >
          <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline">{fileName ? 'Add PDF' : 'Open File'}</span>
        </button>

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 pl-1 border-l border-white/[0.08]">
          <button
            id="toolbar-undo"
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded-md transition-colors ${
              canUndo
                ? 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                : 'text-zinc-600'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            id="toolbar-redo"
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded-md transition-colors ${
              canRedo
                ? 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                : 'text-zinc-600'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center: Primary Editing Tools */}
      <div className="flex items-center gap-0.5 bg-[#0B0D11] p-1 rounded-lg border border-white/[0.08] overflow-x-auto">
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = toolMode === t.id;
          return (
            <button
              key={t.id}
              id={`tool-btn-${t.id}`}
              type="button"
              onClick={() => {
                if (t.id === 'image') {
                  imageInputRef.current?.click();
                } else if (t.id === 'signature') {
                  onOpenSignatureModal();
                } else {
                  setToolMode(t.id);
                }
              }}
              className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isActive ? 'text-white' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'
              }`}
              title={t.label}
            >
              {isActive && (
                <motion.span
                  layoutId="toolbar-active-tool-pill"
                  transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                  className="absolute inset-0 bg-blue-600 rounded-md shadow-xs"
                />
              )}
              <Icon className="relative z-10 w-3.5 h-3.5" />
              <span className="relative z-10 hidden 2xl:inline text-[11px]">{t.short}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Document Controls & Export */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Invert Menu */}
        <div ref={invertMenuRef} className="relative">
          <button
            id="toolbar-invert-menu-btn"
            type="button"
            onClick={() => setShowInvertMenu((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              globalInvert || isCurrentPageInverted
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.09] hover:text-white'
            }`}
            title="Invert document or page colors"
          >
            {isProcessingInvert ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SunMoon className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">Invert</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          <AnimatePresence>
            {showInvertMenu && (
              <motion.div
                id="invert-dropdown-menu"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-10 w-52 bg-[#161A23] border border-white/[0.12] rounded-lg shadow-2xl p-1 z-50 text-xs text-zinc-200 origin-top-right"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowInvertMenu(false);
                    onToggleGlobalInvert();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-white/[0.07] transition-colors text-left"
                >
                  <span>Invert All Pages</span>
                  <span
                    className={`text-[11px] font-mono ${
                      globalInvert ? 'text-blue-400 font-semibold' : 'text-zinc-500'
                    }`}
                  >
                    {globalInvert ? 'On' : 'Off'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowInvertMenu(false);
                    onToggleCurrentPageInvert();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-white/[0.07] transition-colors text-left border-t border-white/[0.06] mt-0.5 pt-2"
                >
                  <span>Invert Current Page</span>
                  <span
                    className={`text-[11px] font-mono ${
                      isCurrentPageInverted ? 'text-blue-400 font-semibold' : 'text-zinc-500'
                    }`}
                  >
                    {isCurrentPageInverted ? 'On' : 'Off'}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Crop Menu */}
        <div className="relative" ref={cropMenuRef}>
          <button
            id="toolbar-crop-btn"
            type="button"
            onClick={() => setShowCropMenu((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              isCroppingActive
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.09] hover:text-white'
            }`}
            title="Crop pages"
          >
            <Crop className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Crop</span>
            <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-150 ${showCropMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showCropMenu && (
              <motion.div
                id="crop-dropdown-menu"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-10 w-56 bg-[#161A23] border border-white/[0.12] rounded-lg shadow-2xl p-1 z-50 text-xs text-zinc-200 origin-top-right"
              >
                <button
                  id="crop-option-all"
                  type="button"
                  onClick={() => {
                    setShowCropMenu(false);
                    onStartAllPageCrop();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-white/[0.07] transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-zinc-100">All Pages</div>
                    <div className="text-[11px] text-zinc-400">Apply uniform crop box</div>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">All</span>
                </button>

                <button
                  id="crop-option-individual"
                  type="button"
                  onClick={() => {
                    setShowCropMenu(false);
                    onStartIndividualCrop();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-white/[0.07] transition-colors text-left border-t border-white/[0.06] mt-0.5 pt-2"
                >
                  <div>
                    <div className="font-medium text-zinc-100">Current Page</div>
                    <div className="text-[11px] text-zinc-400">Crop active page only</div>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">Page</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* View Mode Toggle */}
        <div className="hidden sm:flex items-center bg-[#0B0D11] p-0.5 rounded-md border border-white/[0.08]">
          <button
            id="view-mode-vertical"
            type="button"
            onClick={() => setViewMode('vertical')}
            className={`relative p-1.5 rounded text-xs transition-colors ${
              viewMode === 'vertical'
                ? 'text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Vertical Scroll View"
          >
            {viewMode === 'vertical' && (
              <motion.span
                layoutId="toolbar-view-mode-pill"
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                className="absolute inset-0 bg-white/[0.1] rounded"
              />
            )}
            <Rows className="relative z-10 w-3.5 h-3.5" />
          </button>
          <button
            id="view-mode-grid"
            type="button"
            onClick={() => setViewMode('grid')}
            className={`relative p-1.5 rounded text-xs transition-colors ${
              viewMode === 'grid'
                ? 'text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Multi-Page Grid View"
          >
            {viewMode === 'grid' && (
              <motion.span
                layoutId="toolbar-view-mode-pill"
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                className="absolute inset-0 bg-white/[0.1] rounded"
              />
            )}
            <Columns className="relative z-10 w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rotation Menu */}
        <div ref={rotateMenuRef} className="relative">
          <button
            id="toolbar-rotate-doc"
            type="button"
            onClick={() => setShowRotateMenu((prev) => !prev)}
            className="flex items-center gap-0.5 p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 hover:text-white transition-colors"
            title="Rotate document or page"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-150 ${showRotateMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showRotateMenu && (
              <motion.div
                id="rotate-dropdown-menu"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-10 w-52 bg-[#161A23] border border-white/[0.12] rounded-lg shadow-2xl p-1 z-50 text-xs text-zinc-200 origin-top-right"
              >
                <button
                  id="rotate-option-current"
                  type="button"
                  onClick={() => {
                    setShowRotateMenu(false);
                    if (onRotateCurrentPage) onRotateCurrentPage();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-white/[0.07] transition-colors text-left"
                >
                  <span>Rotate Current Page 90°</span>
                  <span className="text-[11px] text-zinc-500 font-mono">Page</span>
                </button>

                <button
                  id="rotate-option-all"
                  type="button"
                  onClick={() => {
                    setShowRotateMenu(false);
                    onGlobalRotate();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-white/[0.07] transition-colors text-left border-t border-white/[0.06] mt-0.5 pt-2"
                >
                  <span>Rotate All Pages 90°</span>
                  <span className="text-[11px] text-zinc-500 font-mono">All</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center bg-[#0B0D11] rounded-md border border-white/[0.08] px-1 py-0.5">
          <button
            id="toolbar-zoom-out"
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.15).toFixed(2))))}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            title="Zoom Out (Ctrl -)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            id="toolbar-zoom-reset"
            type="button"
            onClick={() => setZoom(1.0)}
            className="px-1.5 py-0.5 text-[11px] font-mono tabular-nums font-medium text-zinc-200 hover:bg-white/[0.08] rounded transition-colors"
            title="Reset Zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            id="toolbar-zoom-in"
            type="button"
            onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))))}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            title="Zoom In (Ctrl +)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="hidden lg:flex items-center border-l border-white/[0.08] ml-1 pl-1 gap-0.5">
            <button
              id="toolbar-fit-width"
              type="button"
              onClick={onFitWidth}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title="Fit Page to Width"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              id="toolbar-fit-page"
              type="button"
              onClick={onFitPage}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title="Fit Whole Page"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Save / Export PDF */}
        <motion.button
          id="toolbar-export-pdf"
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onExportPdf}
          disabled={isExporting || !fileName}
          className={`relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-md disabled:opacity-40 text-white font-medium text-xs transition-colors whitespace-nowrap shrink-0 ${
            justSaved
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : 'bg-blue-600 hover:bg-blue-500 disabled:hover:bg-blue-600'
          }`}
          title={fileName ? 'Choose where to save edited PDF' : 'Load a PDF to export'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isExporting ? (
              <motion.span
                key="exporting"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
                className="flex items-center gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline font-semibold">Saving...</span>
              </motion.span>
            ) : justSaved ? (
              <motion.span
                key="saved"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.16 }}
                className="flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-semibold">Saved</span>
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.14 }}
                className="flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-semibold">Save PDF</span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Extract / More */}
        <div className="relative" ref={moreMenuRef}>
          <button
            id="toolbar-more-btn"
            type="button"
            onClick={() => setShowMoreMenu((prev) => !prev)}
            disabled={!fileName}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.09] text-zinc-200 hover:text-white text-xs font-medium border border-white/[0.08] transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
            title="Extract pages or images"
          >
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden lg:inline">Extract</span>
            <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-150 ${showMoreMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showMoreMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 mt-1.5 w-52 bg-[#161A23] border border-white/[0.12] rounded-lg shadow-2xl p-1 z-50 origin-top-right"
              >
                <button
                  id="menu-item-extract-pages"
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    if (onOpenExtractModal) onOpenExtractModal();
                  }}
                  className="w-full px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07] rounded-md flex items-center gap-2 transition-colors"
                >
                  <Layers className="w-4 h-4 text-blue-400" />
                  <div>
                    <div className="font-medium text-zinc-100">Extract Pages</div>
                    <div className="text-[11px] text-zinc-400">PDF, PNG, JPEG, or WebP</div>
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
