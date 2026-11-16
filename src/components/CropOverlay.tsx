import { useState, useRef, useEffect, useCallback, PointerEvent as ReactPointerEvent } from 'react';
import { Magnet } from 'lucide-react';
import { CropBox } from '../types/pdf';
import { getAspectRatioInfo, snapCropBox, AspectPreset } from '../utils/cropHelpers';

interface CropOverlayProps {
  pageWidth: number;
  pageHeight: number;
  crop: CropBox;
  onChange: (newCrop: CropBox) => void;
  pageNumber?: number;
  lockedRatio?: number | null;
}

type DragHandle =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'move';

export default function CropOverlay({
  pageWidth,
  pageHeight,
  crop,
  onChange,
  pageNumber,
  lockedRatio = null,
}: CropOverlayProps) {
  const [activeHandle, setActiveHandle] = useState<DragHandle | null>(null);
  const [activeSnapPreset, setActiveSnapPreset] = useState<AspectPreset | null>(null);
  const dragStartRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    initialCrop: CropBox;
  } | null>(null);

  const handlePointerDown = (handle: DragHandle, e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveHandle(handle);
    dragStartRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    };
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const { handle, startX, startY, initialCrop } = dragStartRef.current;

      const dx = (e.clientX - startX) / (pageWidth || 1);
      const dy = (e.clientY - startY) / (pageHeight || 1);

      const minDimension = 0.05;
      let { x, y, width, height } = initialCrop;

      if (handle === 'move') {
        const maxX = 1 - width;
        const maxY = 1 - height;
        x = Math.max(0, Math.min(maxX, initialCrop.x + dx));
        y = Math.max(0, Math.min(maxY, initialCrop.y + dy));
      } else {
        if (handle === 'left' || handle === 'top-left' || handle === 'bottom-left') {
          const rightEdge = initialCrop.x + initialCrop.width;
          const newX = Math.max(0, Math.min(rightEdge - minDimension, initialCrop.x + dx));
          x = newX;
          width = rightEdge - newX;
        }

        if (handle === 'right' || handle === 'top-right' || handle === 'bottom-right') {
          const newRight = Math.min(
            1,
            Math.max(initialCrop.x + minDimension, initialCrop.x + initialCrop.width + dx)
          );
          width = newRight - x;
        }

        if (handle === 'top' || handle === 'top-left' || handle === 'top-right') {
          const bottomEdge = initialCrop.y + initialCrop.height;
          const newY = Math.max(0, Math.min(bottomEdge - minDimension, initialCrop.y + dy));
          y = newY;
          height = bottomEdge - newY;
        }

        if (handle === 'bottom' || handle === 'bottom-left' || handle === 'bottom-right') {
          const newBottom = Math.min(
            1,
            Math.max(initialCrop.y + minDimension, initialCrop.y + initialCrop.height + dy)
          );
          height = newBottom - y;
        }
      }

      let finalX = x;
      let finalY = y;
      let finalW = width;
      let finalH = height;

      if (handle !== 'move' && lockedRatio && pageWidth > 0 && pageHeight > 0) {
        const pageAspect = pageWidth / pageHeight;
        // w_norm * pageW / (h_norm * pageH) = lockedRatio  =>  w_norm / h_norm = lockedRatio / pageAspect
        const normRatio = lockedRatio / pageAspect;
        if (handle === 'top' || handle === 'bottom') {
          const targetW = finalH * normRatio;
          if (finalX + targetW <= 1) {
            finalW = Math.max(minDimension, targetW);
          } else {
            finalW = Math.max(minDimension, 1 - finalX);
            finalH = Math.max(minDimension, finalW / normRatio);
          }
        } else {
          const targetH = finalW / normRatio;
          if (handle.includes('top')) {
            const bottomEdge = initialCrop.y + initialCrop.height;
            const newY = bottomEdge - targetH;
            if (newY >= 0) {
              finalY = newY;
              finalH = Math.max(minDimension, targetH);
            } else {
              finalY = 0;
              finalH = Math.max(minDimension, bottomEdge);
              finalW = Math.max(minDimension, finalH * normRatio);
            }
          } else if (finalY + targetH <= 1) {
            finalH = Math.max(minDimension, targetH);
          } else {
            finalH = Math.max(minDimension, 1 - finalY);
            finalW = Math.max(minDimension, finalH * normRatio);
          }
        }
        setActiveSnapPreset(null);
      } else if (handle !== 'move') {
        const snap = snapCropBox(
          handle,
          { x, y, width, height },
          initialCrop,
          pageWidth,
          pageHeight,
          5.6
        );
        finalX = snap.x;
        finalY = snap.y;
        finalW = snap.width;
        finalH = snap.height;
        setActiveSnapPreset(snap.snappedPreset);
      } else {
        setActiveSnapPreset(null);
      }

      onChange({
        x: Math.max(0, Math.min(1, Number(finalX.toFixed(4)))),
        y: Math.max(0, Math.min(1, Number(finalY.toFixed(4)))),
        width: Math.max(minDimension, Math.min(1, Number(finalW.toFixed(4)))),
        height: Math.max(minDimension, Math.min(1, Number(finalH.toFixed(4)))),
      });
    },
    [pageWidth, pageHeight, lockedRatio, onChange]
  );

  const handlePointerUp = useCallback(() => {
    setActiveHandle(null);
    setActiveSnapPreset(null);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [activeHandle, handlePointerMove, handlePointerUp]);

  const leftPercent = crop.x * 100;
  const topPercent = crop.y * 100;
  const widthPercent = crop.width * 100;
  const heightPercent = crop.height * 100;
  const rightPercent = (crop.x + crop.width) * 100;
  const bottomPercent = (crop.y + crop.height) * 100;

  const aspectInfo = getAspectRatioInfo(
    crop.width * (pageWidth || 1),
    crop.height * (pageHeight || 1)
  );

  return (
    <div
      id={pageNumber ? `crop-overlay-page-${pageNumber}` : 'crop-overlay'}
      className="absolute inset-0 z-30 pointer-events-auto select-none overflow-visible"
    >
      {/* Darkened mask outside crop region */}
      <div
        className="absolute left-0 right-0 top-0 bg-black/65 pointer-events-none"
        style={{ height: `${topPercent}%` }}
      />
      <div
        className="absolute left-0 right-0 bottom-0 bg-black/65 pointer-events-none"
        style={{ top: `${bottomPercent}%` }}
      />
      <div
        className="absolute left-0 bg-black/65 pointer-events-none"
        style={{
          top: `${topPercent}%`,
          height: `${heightPercent}%`,
          width: `${leftPercent}%`,
        }}
      />
      <div
        className="absolute right-0 bg-black/65 pointer-events-none"
        style={{
          top: `${topPercent}%`,
          height: `${heightPercent}%`,
          left: `${rightPercent}%`,
        }}
      />

      {/* Active Crop Box Boundary */}
      <div
        className={`absolute border-2 ${
          activeSnapPreset ? 'border-emerald-400' : 'border-blue-400'
        } cursor-move`}
        style={{
          left: `${leftPercent}%`,
          top: `${topPercent}%`,
          width: `${widthPercent}%`,
          height: `${heightPercent}%`,
        }}
        onPointerDown={(e) => handlePointerDown('move', e)}
      >
        {/* Rule-of-Thirds Grid */}
        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
          <div className="border-r border-b border-white/50" />
          <div className="border-r border-b border-white/50" />
          <div className="border-b border-white/50" />
          <div className="border-r border-b border-white/50" />
          <div className="border-r border-b border-white/50" />
          <div className="border-b border-white/50" />
          <div className="border-r border-white/50" />
          <div className="border-r border-white/50" />
          <div />
        </div>

        {/* Edge Bars */}
        <div
          id="crop-bar-top"
          className="absolute left-3 right-3 -top-2.5 h-5 flex items-center justify-center cursor-ns-resize z-40 group"
          onPointerDown={(e) => handlePointerDown('top', e)}
          title="Adjust top edge"
        >
          <div className="w-12 h-1 rounded-full bg-white group-hover:bg-blue-400 shadow transition-colors" />
        </div>
        <div
          id="crop-bar-bottom"
          className="absolute left-3 right-3 -bottom-2.5 h-5 flex items-center justify-center cursor-ns-resize z-40 group"
          onPointerDown={(e) => handlePointerDown('bottom', e)}
          title="Adjust bottom edge"
        >
          <div className="w-12 h-1 rounded-full bg-white group-hover:bg-blue-400 shadow transition-colors" />
        </div>
        <div
          id="crop-bar-left"
          className="absolute top-3 bottom-3 -left-2.5 w-5 flex items-center justify-center cursor-ew-resize z-40 group"
          onPointerDown={(e) => handlePointerDown('left', e)}
          title="Adjust left edge"
        >
          <div className="h-12 w-1 rounded-full bg-white group-hover:bg-blue-400 shadow transition-colors" />
        </div>
        <div
          id="crop-bar-right"
          className="absolute top-3 bottom-3 -right-2.5 w-5 flex items-center justify-center cursor-ew-resize z-40 group"
          onPointerDown={(e) => handlePointerDown('right', e)}
          title="Adjust right edge"
        >
          <div className="h-12 w-1 rounded-full bg-white group-hover:bg-blue-400 shadow transition-colors" />
        </div>

        {/* Corner Handles */}
        <div
          id="crop-dot-top-left"
          className="absolute -top-3 -left-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-50 group"
          onPointerDown={(e) => handlePointerDown('top-left', e)}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 shadow group-hover:scale-125 transition-transform" />
        </div>
        <div
          id="crop-dot-top-right"
          className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nesw-resize z-50 group"
          onPointerDown={(e) => handlePointerDown('top-right', e)}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 shadow group-hover:scale-125 transition-transform" />
        </div>
        <div
          id="crop-dot-bottom-left"
          className="absolute -bottom-3 -left-3 w-6 h-6 flex items-center justify-center cursor-nesw-resize z-50 group"
          onPointerDown={(e) => handlePointerDown('bottom-left', e)}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 shadow group-hover:scale-125 transition-transform" />
        </div>
        <div
          id="crop-dot-bottom-right"
          className="absolute -bottom-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize z-50 group"
          onPointerDown={(e) => handlePointerDown('bottom-right', e)}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 shadow group-hover:scale-125 transition-transform" />
        </div>

        {/* Compact Dimension Readout */}
        <div
          id="crop-dimension-pill"
          className={`absolute top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md text-[11px] font-mono pointer-events-none whitespace-nowrap flex items-center gap-2 z-50 border ${
            activeSnapPreset
              ? 'bg-[#11141B]/95 border-emerald-400/70 text-emerald-300 shadow-lg'
              : 'bg-[#11141B]/90 border-white/[0.15] text-zinc-200 shadow-lg'
          }`}
        >
          <span className="tabular-nums">
            {Math.round(crop.width * 100)}% × {Math.round(crop.height * 100)}%
          </span>
          <span className="text-zinc-500">·</span>
          <span className="font-semibold">{aspectInfo.displayLabel}</span>
          {activeSnapPreset && (
            <span className="flex items-center gap-1 text-emerald-300">
              <Magnet className="w-3 h-3" />
              {activeSnapPreset.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
