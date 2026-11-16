import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Trash2,
  Download,
  Archive,
  Check,
  FileText,
  Layers,
  AlertCircle,
  Loader2,
  SplitSquareHorizontal,
  Image as ImageIcon,
} from 'lucide-react';
import JSZip from 'jszip';
import { PageItem, AnnotationsState, PageDimension, CropBox } from '../types/pdf';
import { parsePageRange, formatPageRange } from '../utils/rangeParser';
import { exportPdfWithAnnotations } from '../utils/pdfHelpers';
import { exportPagesAsImages, ImageExportFormat } from '../utils/imageExportHelpers';
import { saveBlobWithDialog } from '../utils/fileSave';

export type ExtractOutputFormat = 'pdf' | ImageExportFormat;

export interface ExtractionSet {
  id: string;
  name: string;
  rangeText: string;
  selectedPageNumbers: number[]; // 1-based display index 1..pages.length
}

interface ExtractPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: PageItem[];
  thumbnailUrls: Record<number, string>;
  pageRotations: Record<number, number>;
  globalRotation: number;
  pageInverts: Record<number, boolean>;
  globalInvert: boolean;
  originalPdfBytes: Uint8Array | null;
  annotations: AnnotationsState;
  pageDimensions: Record<number, PageDimension>;
  crops: Record<number, CropBox>;
  fileName: string;
  trueRedaction?: boolean;
}

function sanitizeFileName(name: string, fallback: string): string {
  const cleaned = name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  return cleaned || fallback;
}

function uniqueZipName(base: string, ext: string, used: Set<string>): string {
  let candidate = `${base}.${ext}`;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${counter}.${ext}`;
    counter++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export default function ExtractPagesModal({
  isOpen,
  onClose,
  pages,
  thumbnailUrls,
  pageRotations,
  globalRotation,
  pageInverts,
  globalInvert,
  originalPdfBytes,
  annotations,
  pageDimensions,
  crops,
  fileName,
  trueRedaction = false,
}: ExtractPagesModalProps) {
  const totalPages = pages.length;

  const [sets, setSets] = useState<ExtractionSet[]>(() => [
    {
      id: 'set-1',
      name: 'Document 1',
      rangeText: totalPages > 0 ? `1-${totalPages}` : '1',
      selectedPageNumbers: Array.from({ length: totalPages }, (_, i) => i + 1),
    },
  ]);
  const [activeSetId, setActiveSetId] = useState<string>('set-1');
  const [outputFormat, setOutputFormat] = useState<ExtractOutputFormat>('pdf');
  const [transparentBg, setTransparentBg] = useState<boolean>(true);
  const [imageScale, setImageScale] = useState<number>(2);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSets((prev) => {
        if (prev.length === 0) {
          return [
            {
              id: 'set-1',
              name: 'Document 1',
              rangeText: totalPages > 0 ? `1-${totalPages}` : '1',
              selectedPageNumbers: Array.from({ length: totalPages }, (_, i) => i + 1),
            },
          ];
        }
        return prev.map((s) => ({
          ...s,
          selectedPageNumbers: s.selectedPageNumbers.filter(
            (n) => n >= 1 && n <= totalPages
          ),
        }));
      });
      setExportError(null);
    }
  }, [isOpen, totalPages]);

  const activeSet = useMemo(() => {
    return sets.find((s) => s.id === activeSetId) || sets[0] || null;
  }, [sets, activeSetId]);

  if (!isOpen || !activeSet) return null;

  const activeSelectedSet = new Set<number>(activeSet.selectedPageNumbers);
  const isImageFormat = outputFormat !== 'pdf';
  const totalSelectedPagesCount = sets.reduce(
    (sum, s) => sum + s.selectedPageNumbers.length,
    0
  );

  const handleTogglePage = (displayIndex: number) => {
    const nextSelected = new Set<number>(activeSelectedSet);
    if (nextSelected.has(displayIndex)) {
      nextSelected.delete(displayIndex);
    } else {
      nextSelected.add(displayIndex);
    }

    const nextArr = Array.from(nextSelected).sort((a, b) => a - b);
    const nextRangeText = formatPageRange(nextArr);

    setSets((prev) =>
      prev.map((s) =>
        s.id === activeSet.id
          ? { ...s, selectedPageNumbers: nextArr, rangeText: nextRangeText }
          : s
      )
    );
  };

  const handleRangeTextChange = (text: string) => {
    const parsedNumbers = parsePageRange(text, totalPages);
    setSets((prev) =>
      prev.map((s) =>
        s.id === activeSet.id
          ? { ...s, rangeText: text, selectedPageNumbers: parsedNumbers }
          : s
      )
    );
  };

  const handleAddSet = () => {
    const nextSetIndex = sets.length + 1;
    const newSetId = `set-${Date.now()}`;
    const newSet: ExtractionSet = {
      id: newSetId,
      name: `Document ${nextSetIndex}`,
      rangeText: totalPages > 0 ? '1' : '',
      selectedPageNumbers: totalPages > 0 ? [1] : [],
    };
    setSets((prev) => [...prev, newSet]);
    setActiveSetId(newSetId);
  };

  const handleSplitAllPages = () => {
    if (totalPages <= 0) return;
    const splitSets: ExtractionSet[] = Array.from({ length: totalPages }, (_, i) => {
      const pageNum = i + 1;
      return {
        id: `set-split-${pageNum}-${Date.now()}`,
        name: `Document ${pageNum}`,
        rangeText: String(pageNum),
        selectedPageNumbers: [pageNum],
      };
    });
    setSets(splitSets);
    setActiveSetId(splitSets[0].id);
    setExportError(null);
  };

  const handleResetSingleSet = () => {
    const all = Array.from({ length: totalPages }, (_, i) => i + 1);
    const single: ExtractionSet = {
      id: 'set-1',
      name: 'Document 1',
      rangeText: formatPageRange(all),
      selectedPageNumbers: all,
    };
    setSets([single]);
    setActiveSetId(single.id);
    setExportError(null);
  };

  const handleDeleteSet = (idToDelete: string) => {
    if (sets.length <= 1) return;
    const filtered = sets.filter((s) => s.id !== idToDelete);
    setSets(filtered);
    if (activeSetId === idToDelete && filtered[0]) {
      setActiveSetId(filtered[0].id);
    }
  };

  const handleSetNameChange = (id: string, newName: string) => {
    setSets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName } : s))
    );
  };

  const updateActiveSetPages = (nums: number[]) => {
    setSets((prev) =>
      prev.map((s) =>
        s.id === activeSet.id
          ? { ...s, selectedPageNumbers: nums, rangeText: formatPageRange(nums) }
          : s
      )
    );
  };

  const handleSelectAll = () =>
    updateActiveSetPages(Array.from({ length: totalPages }, (_, i) => i + 1));

  const handleClearAll = () => updateActiveSetPages([]);

  const handleSelectOdd = () =>
    updateActiveSetPages(
      Array.from({ length: totalPages }, (_, i) => i + 1).filter((n) => n % 2 !== 0)
    );

  const handleSelectEven = () =>
    updateActiveSetPages(
      Array.from({ length: totalPages }, (_, i) => i + 1).filter((n) => n % 2 === 0)
    );

  const triggerDownload = async (blob: Blob, downloadName: string): Promise<boolean> => {
    return saveBlobWithDialog(blob, downloadName);
  };

  const handleExecuteExtraction = async () => {
    if (!originalPdfBytes) return;

    for (const s of sets) {
      if (!s.selectedPageNumbers || s.selectedPageNumbers.length === 0) {
        setExportError(`"${s.name}" has no pages selected.`);
        return;
      }
    }

    setExportError(null);
    setIsExporting(true);

    try {
      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'document';

      if (outputFormat === 'pdf') {
        if (sets.length === 1) {
          const targetSet = sets[0];
          const selectedPages = targetSet.selectedPageNumbers
            .map((displayIdx) => pages[displayIdx - 1])
            .filter(Boolean);

          const exportedBytes = await exportPdfWithAnnotations(
            originalPdfBytes,
            annotations,
            pageRotations,
            globalRotation,
            pageDimensions,
            crops,
            pageInverts,
            globalInvert,
            selectedPages,
            trueRedaction
          );

          const cleanSetName = sanitizeFileName(targetSet.name, 'extracted');
          const saved = await triggerDownload(
            new Blob([exportedBytes], { type: 'application/pdf' }),
            `${baseName}_${cleanSetName}.pdf`
          );
          if (saved) onClose();
        } else {
          const zip = new JSZip();
          const usedNames = new Set<string>();

          for (let i = 0; i < sets.length; i++) {
            const targetSet = sets[i];
            const selectedPages = targetSet.selectedPageNumbers
              .map((displayIdx) => pages[displayIdx - 1])
              .filter(Boolean);

            const exportedBytes = await exportPdfWithAnnotations(
              originalPdfBytes,
              annotations,
              pageRotations,
              globalRotation,
              pageDimensions,
              crops,
              pageInverts,
              globalInvert,
              selectedPages,
              trueRedaction
            );

            const cleanSetName = sanitizeFileName(targetSet.name, `Document_${i + 1}`);
            const pdfFileName = uniqueZipName(cleanSetName, 'pdf', usedNames);
            zip.file(pdfFileName, exportedBytes);
          }

          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const saved = await triggerDownload(zipBlob, `${baseName}_extracted_sets.zip`);
          if (saved) onClose();
        }
      } else {
        // Image extraction: PNG (with optional transparency), JPEG, or WebP
        const imageFormat = outputFormat as ImageExportFormat;

        if (sets.length === 1 && sets[0].selectedPageNumbers.length === 1) {
          const targetSet = sets[0];
          const displayIdx = targetSet.selectedPageNumbers[0];
          const selectedPage = pages[displayIdx - 1];
          if (!selectedPage) {
            setExportError('Selected page could not be resolved.');
            return;
          }

          const [img] = await exportPagesAsImages(
            originalPdfBytes,
            annotations,
            pageRotations,
            globalRotation,
            pageDimensions,
            crops,
            pageInverts,
            globalInvert,
            [selectedPage],
            {
              format: imageFormat,
              scale: imageScale,
              transparentBackground: transparentBg,
            }
          );

          const cleanSetName = sanitizeFileName(targetSet.name, `page_${displayIdx}`);
          const saved = await triggerDownload(
            img.blob,
            `${baseName}_${cleanSetName}.${img.extension}`
          );
          if (saved) onClose();
        } else {
          const zip = new JSZip();
          const usedNames = new Set<string>();

          for (let i = 0; i < sets.length; i++) {
            const targetSet = sets[i];
            const selectedPages = targetSet.selectedPageNumbers
              .map((displayIdx) => pages[displayIdx - 1])
              .filter(Boolean);

            const renderedImages = await exportPagesAsImages(
              originalPdfBytes,
              annotations,
              pageRotations,
              globalRotation,
              pageDimensions,
              crops,
              pageInverts,
              globalInvert,
              selectedPages,
              {
                format: imageFormat,
                scale: imageScale,
                transparentBackground: transparentBg,
              }
            );

            const cleanSetName = sanitizeFileName(targetSet.name, `Document_${i + 1}`);

            renderedImages.forEach((img, idx) => {
              const displayPageNum = targetSet.selectedPageNumbers[idx] ?? idx + 1;
              const fileBase =
                renderedImages.length === 1
                  ? cleanSetName
                  : `${cleanSetName}_page_${displayPageNum}`;
              const fileNameInZip = uniqueZipName(fileBase, img.extension, usedNames);
              zip.file(fileNameInZip, img.blob);
            });
          }

          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const saved = await triggerDownload(zipBlob, `${baseName}_${imageFormat}_pages.zip`);
          if (saved) onClose();
        }
      }
    } catch (err) {
      console.error('Extraction failed:', err);
      setExportError('Failed to generate output. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const getCtaLabel = () => {
    if (isExporting) return 'Generating...';
    if (outputFormat === 'pdf') {
      return sets.length > 1
        ? `Extract ${sets.length} PDFs as .ZIP`
        : 'Extract & Download PDF';
    }
    const fmtUpper = outputFormat.toUpperCase();
    if (totalSelectedPagesCount === 1 && sets.length === 1) {
      return `Download ${fmtUpper}`;
    }
    return `Extract ${totalSelectedPagesCount} ${fmtUpper}s as .ZIP`;
  };

  return (
    <motion.div
      id="extract-pages-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-6xl h-[88vh] bg-[#11141B] border border-white/[0.1] rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="h-14 px-5 bg-[#151821] border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/15 text-blue-400 rounded-lg border border-blue-500/25">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Extract &amp; Export Pages
              </h2>
              <p className="text-xs text-zinc-400">
                Split into documents or export cropped pages as PDF, PNG, JPEG, or WebP
              </p>
            </div>
          </div>

          <button
            id="btn-close-extract-modal"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.07] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: Page Thumbnails Grid */}
          <div className="flex-1 flex flex-col bg-[#0B0D11] border-r border-white/[0.08] min-w-0">
            <div className="px-5 py-2.5 bg-[#11141B] border-b border-white/[0.08] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="font-semibold text-zinc-100">{activeSet.name}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400 font-mono tabular-nums">
                  {activeSet.selectedPageNumbers.length} / {totalPages} selected
                </span>
              </div>
              <span className="text-[11px] text-zinc-500">
                Click pages to toggle selection
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                {pages.map((pageItem, index) => {
                  const displayIndex = index + 1;
                  const isChecked = activeSelectedSet.has(displayIndex);
                  const thumbUrl = thumbnailUrls[pageItem.pdfPageNum];
                  const isInverted = Boolean(
                    globalInvert || pageInverts[pageItem.pdfPageNum]
                  );

                  return (
                    <button
                      key={pageItem.id}
                      id={`extract-page-thumbnail-${displayIndex}`}
                      type="button"
                      onClick={() => handleTogglePage(displayIndex)}
                      className={`group relative flex flex-col items-center p-2 rounded-lg text-left transition-colors border ${
                        isChecked
                          ? 'bg-[#182032] border-blue-500/80 ring-1 ring-blue-500/40'
                          : 'bg-[#13161F] border-white/[0.07] hover:bg-[#171B26] hover:border-white/[0.14]'
                      }`}
                    >
                      <div
                        className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                          isChecked
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-[#0B0D11]/80 border-white/20 text-transparent group-hover:border-white/40'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>

                      <div
                        className={`w-full aspect-[3/4] bg-white rounded flex items-center justify-center overflow-hidden relative mb-2 ${
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
                            {(() => {
                              const c = crops?.[pageItem.pdfPageNum];
                              const cropped = Boolean(
                                c &&
                                  (c.x > 0.002 ||
                                    c.y > 0.002 ||
                                    c.width < 0.998 ||
                                    c.height < 0.998)
                              );
                              if (!cropped || !c) return null;
                              return (
                                <div className="absolute inset-0 pointer-events-none">
                                  <div
                                    className="absolute left-0 right-0 top-0 bg-black/65"
                                    style={{ height: `${c.y * 100}%` }}
                                  />
                                  <div
                                    className="absolute left-0 right-0 bottom-0 bg-black/65"
                                    style={{ top: `${(c.y + c.height) * 100}%` }}
                                  />
                                  <div
                                    className="absolute left-0 bg-black/65"
                                    style={{
                                      top: `${c.y * 100}%`,
                                      height: `${c.height * 100}%`,
                                      width: `${c.x * 100}%`,
                                    }}
                                  />
                                  <div
                                    className="absolute right-0 bg-black/65"
                                    style={{
                                      top: `${c.y * 100}%`,
                                      height: `${c.height * 100}%`,
                                      left: `${(c.x + c.width) * 100}%`,
                                    }}
                                  />
                                  <div
                                    className="absolute border border-blue-400/90"
                                    style={{
                                      left: `${c.x * 100}%`,
                                      top: `${c.y * 100}%`,
                                      width: `${c.width * 100}%`,
                                      height: `${c.height * 100}%`,
                                    }}
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-zinc-400 gap-1">
                            <FileText className="w-6 h-6 text-zinc-300" />
                            <span className="text-[10px] text-zinc-400 font-mono">
                              {pageItem.label}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="w-full flex items-center justify-between text-[11px] px-0.5">
                        <span
                          className={`font-medium truncate ${
                            isChecked ? 'text-zinc-100' : 'text-zinc-400'
                          }`}
                        >
                          {pageItem.label}
                        </span>
                        <span className="text-zinc-500 font-mono tabular-nums">
                          {displayIndex}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-80 sm:w-90 bg-[#11141B] flex flex-col shrink-0">
            {/* Document Sets Header */}
            <div className="px-4 py-3 bg-[#151821] border-b border-white/[0.08] flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-200">
                Documents{' '}
                <span className="font-mono tabular-nums text-zinc-500 ml-1">
                  ({sets.length})
                </span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  id="btn-split-all-pages"
                  type="button"
                  onClick={handleSplitAllPages}
                  className="flex items-center gap-1 px-2 py-1 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 hover:text-white rounded-md text-[11px] font-medium border border-white/[0.08] transition-colors"
                  title="Split every page into Document 1, 2, 3..."
                >
                  <SplitSquareHorizontal className="w-3 h-3 text-blue-400" />
                  <span>Split All</span>
                </button>
                {sets.length > 1 && (
                  <button
                    id="btn-reset-single-set"
                    type="button"
                    onClick={handleResetSingleSet}
                    className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.09] text-zinc-400 hover:text-zinc-200 rounded-md text-[11px] border border-white/[0.08] transition-colors"
                    title="Reset back to a single combined document"
                  >
                    1 Set
                  </button>
                )}
                <button
                  id="btn-add-extract-set"
                  type="button"
                  onClick={handleAddSet}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white rounded-md text-[11px] font-medium border border-blue-500/30 transition-colors"
                  title="Add another document set"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Sets List */}
            <div className="p-3 border-b border-white/[0.08] max-h-44 overflow-y-auto space-y-1.5">
              {sets.map((set, idx) => {
                const isActive = set.id === activeSet.id;
                return (
                  <div
                    key={set.id}
                    onClick={() => setActiveSetId(set.id)}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors border text-xs ${
                      isActive
                        ? 'bg-[#182032] border-blue-500/70 text-white'
                        : 'bg-[#151821] border-white/[0.06] text-zinc-300 hover:bg-[#191D28] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono tabular-nums text-[11px] text-zinc-500 w-4 shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="truncate font-medium">{set.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
                        {set.selectedPageNumbers.length}p
                      </span>
                      {sets.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSet(set.id);
                          }}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Remove set"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Set Configuration + Output Format */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Output Format */}
              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium block">
                  Output Format
                </label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-[#0B0D11] border border-white/[0.08] rounded-lg">
                  {(['pdf', 'png', 'jpeg', 'webp'] as ExtractOutputFormat[]).map(
                    (fmt) => (
                      <button
                        key={fmt}
                        id={`extract-format-${fmt}`}
                        type="button"
                        onClick={() => setOutputFormat(fmt)}
                        className={`relative py-1.5 rounded-md text-[11px] font-semibold uppercase transition-colors ${
                          outputFormat === fmt
                            ? 'text-white'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                        }`}
                      >
                        {outputFormat === fmt && (
                          <motion.span
                            layoutId="extract-format-pill"
                            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                            className="absolute inset-0 bg-blue-600 rounded-md"
                          />
                        )}
                        <span className="relative z-10">{fmt}</span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Image-Specific Options */}
              <AnimatePresence initial={false}>
                {isImageFormat && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 bg-[#151821] border border-white/[0.08] rounded-lg space-y-3">
                      <div className="flex items-center gap-1.5 text-zinc-200 font-medium">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>{outputFormat.toUpperCase()} Settings</span>
                      </div>

                      {/* Scale / DPI */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span>Resolution</span>
                          <span className="font-mono tabular-nums text-zinc-300">
                            {imageScale * 72} DPI
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#0B0D11] border border-white/[0.08] rounded-md">
                          {[1, 2, 3].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setImageScale(s)}
                              className={`relative py-1 rounded text-[11px] font-mono tabular-nums transition-colors ${
                                imageScale === s
                                  ? 'text-white font-semibold'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {imageScale === s && (
                                <motion.span
                                  layoutId="extract-scale-pill"
                                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                  className="absolute inset-0 bg-white/[0.12] rounded"
                                />
                              )}
                              <span className="relative z-10">{s}x</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Transparent Background Toggle (PNG & WebP) */}
                      {(outputFormat === 'png' || outputFormat === 'webp') ? (
                        <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                          <div>
                            <div className="text-zinc-200 font-medium">
                              Transparent Background
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              Preserve alpha channel where PDF has no fill
                            </div>
                          </div>
                          <input
                            id="extract-transparent-bg"
                            type="checkbox"
                            checked={transparentBg}
                            onChange={(e) => setTransparentBg(e.target.checked)}
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
                          />
                        </label>
                      ) : (
                        <p className="text-[11px] text-zinc-400">
                          JPEG does not support transparency; white background applied.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Set Name */}
              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium block">
                  Document Name
                </label>
                <input
                  type="text"
                  value={activeSet.name}
                  onChange={(e) => handleSetNameChange(activeSet.id, e.target.value)}
                  className="w-full bg-[#0B0D11] border border-white/[0.1] rounded-md px-3 py-1.5 text-zinc-100 font-medium text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="e.g. Document 1"
                />
              </div>

              {/* Page Range */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-300 font-medium block">
                    Page Range
                  </label>
                  <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    {activeSet.selectedPageNumbers.length} selected
                  </span>
                </div>
                <input
                  id="extract-range-input"
                  type="text"
                  value={activeSet.rangeText}
                  onChange={(e) => handleRangeTextChange(e.target.value)}
                  placeholder="e.g. 1, 3-5, 8"
                  className="w-full bg-[#0B0D11] border border-white/[0.1] rounded-md px-3 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>

              {/* Quick Selection */}
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1.5 bg-[#151821] hover:bg-white/[0.07] text-zinc-300 hover:text-white rounded-md border border-white/[0.08] transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2.5 py-1.5 bg-[#151821] hover:bg-white/[0.07] text-zinc-300 hover:text-white rounded-md border border-white/[0.08] transition-colors"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={handleSelectOdd}
                  className="px-2.5 py-1.5 bg-[#151821] hover:bg-white/[0.07] text-zinc-300 hover:text-white rounded-md border border-white/[0.08] transition-colors"
                >
                  Odd Pages
                </button>
                <button
                  type="button"
                  onClick={handleSelectEven}
                  className="px-2.5 py-1.5 bg-[#151821] hover:bg-white/[0.07] text-zinc-300 hover:text-white rounded-md border border-white/[0.08] transition-colors"
                >
                  Even Pages
                </button>
              </div>

              {exportError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-start gap-2 text-rose-200 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{exportError}</span>
                </div>
              )}
            </div>

            {/* Bottom Extract CTA */}
            <div className="p-4 bg-[#151821] border-t border-white/[0.08] shrink-0">
              <motion.button
                id="btn-extract-execute"
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleExecuteExtraction}
                disabled={isExporting}
                className="relative overflow-hidden w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white font-semibold text-xs transition-colors"
              >
                {isExporting && (
                  <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: '200%' }}
                    transition={{ repeat: Infinity, duration: 1.0, ease: 'easeInOut' }}
                    className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none"
                  />
                )}
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{getCtaLabel()}</span>
                  </>
                ) : sets.length > 1 || (isImageFormat && totalSelectedPagesCount > 1) ? (
                  <>
                    <Archive className="w-4 h-4" />
                    <span>{getCtaLabel()}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>{getCtaLabel()}</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
