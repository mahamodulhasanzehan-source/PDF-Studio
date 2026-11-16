import { useState, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  FileText,
  SunMoon,
  Crop,
  Trash2,
  GripVertical,
  CopyPlus,
  FilePlus2,
} from 'lucide-react';
import { CropBox, PageItem } from '../types/pdf';

interface SidebarThumbnailsProps {
  pages: PageItem[];
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  onRotatePage: (pageNumber: number) => void;
  pageRotations: Record<number, number>;
  globalRotation: number;
  thumbnailUrls: Record<number, string>;
  pageInverts?: Record<number, boolean>;
  globalInvert?: boolean;
  crops?: Record<number, CropBox>;
  onTogglePageInvert?: (pageNumber: number) => void;
  onStartIndividualCrop?: (pageNumber: number) => void;
  activeCropPage?: number | null;
  onDeletePage?: (pageId: string) => void;
  onDuplicatePage?: (index: number) => void;
  onInsertBlankPage?: () => void;
  onReorderPages?: (sourceIndex: number, targetIndex: number) => void;
}

export default function SidebarThumbnails({
  pages,
  currentPage,
  onPageSelect,
  onRotatePage,
  thumbnailUrls,
  pageInverts = {},
  globalInvert = false,
  crops = {},
  onTogglePageInvert,
  onStartIndividualCrop,
  activeCropPage,
  onDeletePage,
  onDuplicatePage,
  onInsertBlankPage,
  onReorderPages,
}: SidebarThumbnailsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const numPages = pages.length;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, pageItem: PageItem) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      if (onDeletePage && numPages > 1) {
        onDeletePage(pageItem.id);
      }
    }
  };

  return (
    <aside
      id="sidebar-thumbnails"
      className={`relative h-full bg-[#11141B] border-r border-white/[0.08] flex flex-col transition-all duration-200 z-10 shrink-0 select-none ${
        collapsed ? 'w-10' : 'w-60'
      }`}
    >
      {/* Sidebar Header */}
      <div className="h-10 bg-[#141821] border-b border-white/[0.08] flex items-center justify-between px-3 text-zinc-300 shrink-0 gap-1">
        {!collapsed && (
          <>
            <span className="text-xs font-semibold tracking-tight text-zinc-300">
              Pages <span className="font-mono tabular-nums text-zinc-500 ml-1">{numPages}</span>
            </span>
            {onInsertBlankPage && numPages > 0 && (
              <button
                id="btn-insert-blank-page"
                type="button"
                onClick={onInsertBlankPage}
                className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] text-zinc-300 hover:text-white transition-colors"
                title="Insert blank page"
              >
                <FilePlus2 className="w-3 h-3 text-blue-400" />
                <span>Blank</span>
              </button>
            )}
          </>
        )}
        <button
          id="toggle-thumbnail-sidebar"
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={`p-1 hover:bg-white/[0.07] rounded text-zinc-400 hover:text-white transition-colors ${
            collapsed || !onInsertBlankPage || numPages === 0 ? 'ml-auto' : ''
          }`}
          title={collapsed ? 'Expand Thumbnails' : 'Collapse Sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Thumbnails Scrollable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {numPages === 0 && !collapsed && (
          <div className="flex flex-col items-center justify-center h-44 text-center p-4 text-zinc-500">
            <FileText className="w-7 h-7 mb-2 opacity-40" />
            <span className="text-xs">No pages loaded</span>
          </div>
        )}

        <AnimatePresence initial={false}>
        {pages.map((pageItem, index) => {
          const pageNum = pageItem.pdfPageNum;
          const isSelected = pageNum === currentPage;
          const thumbUrl = thumbnailUrls[pageNum];
          const isInverted = Boolean(globalInvert || pageInverts[pageNum]);
          const crop = crops[pageNum];
          const isCropped = Boolean(
            crop &&
              (crop.x > 0.002 ||
                crop.y > 0.002 ||
                crop.width < 0.998 ||
                crop.height < 0.998)
          );
          const isBeingDragged = draggedIndex === index;
          const isDropTarget =
            dropTargetIndex === index && draggedIndex !== null && draggedIndex !== index;

          if (collapsed) {
            return (
              <button
                key={pageItem.id}
                type="button"
                onClick={() => onPageSelect(pageNum)}
                className={`w-full py-1.5 rounded flex items-center justify-center text-xs font-mono tabular-nums font-medium transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
                }`}
                title={pageItem.label}
              >
                {index + 1}
              </button>
            );
          }

          return (
            <motion.div
              key={pageItem.id}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              id={`thumbnail-card-${pageItem.id}`}
              tabIndex={0}
              onClick={() => onPageSelect(pageNum)}
              onKeyDown={(e) => handleKeyDown(e, pageItem)}
              draggable={Boolean(onReorderPages && numPages > 1)}
              onDragStart={(e) => {
                setDraggedIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropTargetIndex !== index) {
                  setDropTargetIndex(index);
                }
              }}
              onDragLeave={() => {
                if (dropTargetIndex === index) {
                  setDropTargetIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedIndex !== null && draggedIndex !== index && onReorderPages) {
                  onReorderPages(draggedIndex, index);
                }
                setDraggedIndex(null);
                setDropTargetIndex(null);
              }}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDropTargetIndex(null);
              }}
              className={`group relative flex flex-col items-center p-2 rounded-lg cursor-pointer transition-colors border outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                isBeingDragged
                  ? 'opacity-40 scale-95 border-dashed border-blue-400'
                  : isDropTarget
                  ? 'border-blue-500 bg-blue-500/10'
                  : isSelected
                  ? 'bg-[#181E2B] border-blue-500/70'
                  : 'bg-[#151821] border-white/[0.06] hover:bg-[#191E2A] hover:border-white/[0.12]'
              }`}
            >
              {isDropTarget && (
                <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none" />
              )}

              {/* Drag Handle & Page Indicator */}
              <div className="w-full flex items-center justify-between pb-1.5 px-0.5">
                <div className="flex items-center gap-1">
                  <div
                    className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
                    title="Drag to reorder page"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono tabular-nums">
                    {index + 1}
                  </span>
                </div>

                <span
                  className={`text-[11px] font-medium truncate ${
                    isSelected ? 'text-blue-400' : 'text-zinc-400'
                  }`}
                  title={pageItem.label}
                >
                  {pageItem.label}
                </span>
              </div>

              {/* Thumbnail Preview */}
              <div
                className={`w-full aspect-[3/4] bg-white rounded flex items-center justify-center overflow-hidden relative ${
                  isInverted ? 'filter invert hue-rotate-180' : ''
                }`}
              >
                {thumbUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={thumbUrl}
                      alt={pageItem.label}
                      className="w-full h-full object-contain pointer-events-none"
                      referrerPolicy="no-referrer"
                    />
                    {isCropped && crop && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div
                          className="absolute left-0 right-0 top-0 bg-black/65"
                          style={{ height: `${crop.y * 100}%` }}
                        />
                        <div
                          className="absolute left-0 right-0 bottom-0 bg-black/65"
                          style={{ top: `${(crop.y + crop.height) * 100}%` }}
                        />
                        <div
                          className="absolute left-0 bg-black/65"
                          style={{
                            top: `${crop.y * 100}%`,
                            height: `${crop.height * 100}%`,
                            width: `${crop.x * 100}%`,
                          }}
                        />
                        <div
                          className="absolute right-0 bg-black/65"
                          style={{
                            top: `${crop.y * 100}%`,
                            height: `${crop.height * 100}%`,
                            left: `${(crop.x + crop.width) * 100}%`,
                          }}
                        />
                        <div
                          className="absolute border border-blue-400/90"
                          style={{
                            left: `${crop.x * 100}%`,
                            top: `${crop.y * 100}%`,
                            width: `${crop.width * 100}%`,
                            height: `${crop.height * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-400 gap-1">
                    <FileText className="w-7 h-7 text-zinc-300" />
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {pageItem.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Page Action Controls */}
              <div className="w-full flex items-center justify-end gap-0.5 mt-2">
                {onDuplicatePage && (
                  <button
                    id={`sidebar-duplicate-page-${pageNum}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicatePage(index);
                    }}
                    className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
                    title={`Duplicate ${pageItem.label}`}
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                  </button>
                )}

                {onStartIndividualCrop && (
                  <button
                    id={`sidebar-crop-page-${pageNum}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartIndividualCrop(pageNum);
                    }}
                    className={`p-1 rounded transition-colors ${
                      activeCropPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-white/[0.08] text-zinc-400 hover:text-white'
                    }`}
                    title={`Crop ${pageItem.label}`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                  </button>
                )}

                {onTogglePageInvert && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePageInvert(pageNum);
                    }}
                    className={`p-1 rounded transition-colors ${
                      pageInverts[pageNum]
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-white/[0.08] text-zinc-400 hover:text-white'
                    }`}
                    title={pageInverts[pageNum] ? 'Revert Page Invert' : 'Invert This Page'}
                  >
                    <SunMoon className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotatePage(pageNum);
                  }}
                  className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-colors"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                {onDeletePage && (
                  <button
                    id={`sidebar-delete-page-${pageNum}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePage(pageItem.id);
                    }}
                    disabled={numPages <= 1}
                    className={`p-1 rounded transition-colors ${
                      numPages <= 1
                        ? 'opacity-25 text-zinc-600'
                        : 'hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400'
                    }`}
                    title={
                      numPages <= 1
                        ? 'Cannot delete the only page'
                        : `Delete ${pageItem.label}`
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>
    </aside>
  );
}
