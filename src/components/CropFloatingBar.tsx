import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, RotateCcw, Crop, SlidersHorizontal, Lock } from 'lucide-react';
import { CropBox } from '../types/pdf';

export type CropAspectLock = 'free' | '1:1' | '4:3' | '16:9' | 'a4' | 'letter';

const ASPECT_OPTIONS: { id: CropAspectLock; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'a4', label: 'A4', ratio: 210 / 297 },
  { id: 'letter', label: 'Letter', ratio: 8.5 / 11 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

interface CropFloatingBarProps {
  type: 'all' | 'individual';
  pageNumber?: number;
  numPages: number;
  pendingCrop: CropBox;
  aspectLock: CropAspectLock;
  onAspectLockChange: (lock: CropAspectLock, ratio: number | null) => void;
  onCropChange: (newCrop: CropBox) => void;
  onApply: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export default function CropFloatingBar({
  type,
  pageNumber,
  numPages,
  pendingCrop,
  aspectLock,
  onAspectLockChange,
  onCropChange,
  onApply,
  onCancel,
  onReset,
}: CropFloatingBarProps) {
  const [showMargins, setShowMargins] = useState(false);

  const leftPct = Math.round(pendingCrop.x * 100);
  const topPct = Math.round(pendingCrop.y * 100);
  const rightPct = Math.max(0, Math.round((1 - (pendingCrop.x + pendingCrop.width)) * 100));
  const bottomPct = Math.max(0, Math.round((1 - (pendingCrop.y + pendingCrop.height)) * 100));

  const updateMargin = (side: 'left' | 'top' | 'right' | 'bottom', rawPct: number) => {
    const val = Math.max(0, Math.min(90, isNaN(rawPct) ? 0 : rawPct)) / 100;
    let l = pendingCrop.x;
    let r = pendingCrop.x + pendingCrop.width;
    let t = pendingCrop.y;
    let b = pendingCrop.y + pendingCrop.height;

    if (side === 'left') l = Math.min(r - 0.05, val);
    else if (side === 'right') r = Math.max(l + 0.05, 1 - val);
    else if (side === 'top') t = Math.min(b - 0.05, val);
    else if (side === 'bottom') b = Math.max(t + 0.05, 1 - val);

    onCropChange({
      x: Number(l.toFixed(4)),
      y: Number(t.toFixed(4)),
      width: Number(Math.max(0.05, r - l).toFixed(4)),
      height: Number(Math.max(0.05, b - t).toFixed(4)),
    });
  };

  return (
    <motion.div
      id="crop-floating-action-bar"
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 p-3 bg-[#161A23]/95 backdrop-blur-md border border-white/[0.12] shadow-2xl rounded-xl text-zinc-100 select-none"
    >
      {/* Numeric Margins Panel (optional toggle) */}
      <AnimatePresence initial={false}>
        {showMargins && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-white/[0.08] text-[11px]">
              <span className="text-zinc-400 font-medium mr-1">Margins %</span>
              {(
                [
                  ['T', 'top', topPct],
                  ['R', 'right', rightPct],
                  ['B', 'bottom', bottomPct],
                  ['L', 'left', leftPct],
                ] as const
              ).map(([lbl, key, val]) => (
                <label key={key} className="flex items-center gap-1 bg-[#0B0D11] border border-white/[0.1] rounded px-1.5 py-0.5">
                  <span className="text-zinc-500 font-mono">{lbl}</span>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={val}
                    onChange={(e) => updateMargin(key, parseInt(e.target.value, 10))}
                    className="w-9 bg-transparent text-zinc-100 font-mono tabular-nums text-right focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aspect Ratio Presets */}
      <div className="flex items-center gap-1.5 pb-2 border-b border-white/[0.08]">
        <span className="flex items-center gap-1 text-[11px] text-zinc-400 mr-1">
          <Lock className="w-3 h-3" />
          <span>Ratio</span>
        </span>
        <div className="flex items-center gap-1">
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onAspectLockChange(opt.id, opt.ratio)}
              className={`relative px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                aspectLock === opt.id
                  ? 'text-white'
                  : 'bg-[#0B0D11] text-zinc-400 hover:text-white border border-white/[0.08]'
              }`}
            >
              {aspectLock === opt.id && (
                <motion.span
                  layoutId="crop-ratio-pill"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="absolute inset-0 bg-blue-600 rounded"
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowMargins((prev) => !prev)}
          className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
            showMargins
              ? 'bg-white/[0.12] border-white/[0.2] text-white'
              : 'bg-[#0B0D11] border-white/[0.08] text-zinc-400 hover:text-white'
          }`}
          title="Toggle numeric margin inputs"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>Margins</span>
        </button>
      </div>

      {/* Main Action Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 pr-3 border-r border-white/[0.08]">
          <div className="p-1.5 rounded-md bg-blue-600/15 border border-blue-500/30 text-blue-400">
            <Crop className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-zinc-100">
              {type === 'all'
                ? `Crop All Pages (${numPages})`
                : `Crop Page ${pageNumber}`}
            </span>
            <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
              {Math.round(pendingCrop.width * 100)}% × {Math.round(pendingCrop.height * 100)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="crop-btn-reset"
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-colors"
            title="Reset crop to full page"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>

          <button
            id="crop-btn-cancel"
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-colors"
            title="Cancel crop"
          >
            <X className="w-3 h-3" />
            <span>Cancel</span>
          </button>

          <button
            id="crop-btn-apply"
            type="button"
            onClick={onApply}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            title="Apply crop"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
