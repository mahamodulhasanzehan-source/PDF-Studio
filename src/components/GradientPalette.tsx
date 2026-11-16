import { useRef, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { Pipette, Trash2, Check } from 'lucide-react';
import { RedactionAnnotation } from '../types/pdf';

interface GradientPaletteProps {
  fillColor: string;
  onChangeFillColor: (color: string, commit?: boolean) => void;
  opacity: number;
  onChangeOpacity: (opacity: number) => void;
  onOpacityCommit?: () => void;
  selectedRegion: RedactionAnnotation | null;
  onDeleteSelectedRegion: () => void;
  onActivateEyeDropper: () => void;
  onOpenColorModal: () => void;
}

const GRADIENT_PRESETS = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function GradientPalette({
  fillColor,
  onChangeFillColor,
  opacity,
  onChangeOpacity,
  onOpacityCommit,
  selectedRegion,
  onDeleteSelectedRegion,
  onActivateEyeDropper,
  onOpenColorModal,
}: GradientPaletteProps) {
  const spectrumRef = useRef<HTMLDivElement>(null);

  const sampleSpectrum = useCallback(
    (clientX: number, commit: boolean) => {
      if (!spectrumRef.current) return;
      const rect = spectrumRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const hue = Math.round((x / (rect.width || 1)) * 360);
      onChangeFillColor(hslToHex(hue, 1.0, 0.5), commit);
    },
    [onChangeFillColor]
  );

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    sampleSpectrum(e.clientX, false);
    const onMouseMove = (moveEvent: MouseEvent) => {
      sampleSpectrum(moveEvent.clientX, false);
    };
    const onMouseUp = (upEvent: MouseEvent) => {
      sampleSpectrum(upEvent.clientX, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-medium text-zinc-400">Fill Region</span>

      <button
        id="pick-color-from-pdf-btn"
        type="button"
        onClick={onActivateEyeDropper}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.1] text-zinc-200 text-[11px] font-medium transition-colors"
        title="Sample exact color from PDF"
      >
        <Pipette className="w-3.5 h-3.5 text-blue-400" />
        <span>Sample</span>
      </button>

      <div
        ref={spectrumRef}
        onMouseDown={handleMouseDown}
        className="w-28 h-5 rounded cursor-crosshair border border-white/[0.15] relative"
        style={{
          background:
            'linear-gradient(to right, #ff0000 0%, #ff8000 12.5%, #ffff00 25%, #00ff00 37.5%, #00ffff 50%, #0000ff 62.5%, #8000ff 75%, #ff00ff 87.5%, #ff0000 100%)',
        }}
        title="Drag to pick color"
      />

      <div className="flex items-center gap-1">
        {GRADIENT_PRESETS.map((hex) => {
          const isSelected = hex.toLowerCase() === fillColor.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChangeFillColor(hex, true)}
              className={`w-4 h-4 rounded-full border border-white/20 transition-transform ${
                isSelected ? 'ring-2 ring-blue-400 scale-110 z-10' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: hex }}
              title={hex}
            >
              {isSelected && (
                <Check
                  className={`w-2.5 h-2.5 mx-auto ${
                    hex === '#ffffff' || hex === '#eab308' ? 'text-black' : 'text-white'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <button
        id="fill-active-color-swatch"
        type="button"
        onClick={onOpenColorModal}
        className="flex items-center gap-1.5 px-2 py-1 bg-[#0B0D11] border border-white/[0.1] rounded-md hover:bg-white/[0.06] transition-colors"
        title="Custom Color & Hex"
      >
        <div
          className="w-3.5 h-3.5 rounded-sm border border-white/20"
          style={{ backgroundColor: fillColor }}
        />
        <span className="text-[11px] font-mono text-zinc-300">{fillColor}</span>
      </button>

      <div className="flex items-center gap-2 bg-[#0B0D11] border border-white/[0.1] rounded-md px-2.5 py-1">
        <span className="text-[11px] text-zinc-400">Opacity</span>
        <input
          id="fill-opacity-slider"
          type="range"
          min="0.05"
          max="1.0"
          step="0.05"
          value={opacity}
          onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
          onMouseUp={onOpacityCommit}
          onTouchEnd={onOpacityCommit}
          onBlur={onOpacityCommit}
          className="w-14 accent-blue-500 cursor-pointer h-1"
        />
        <span className="text-[11px] font-mono tabular-nums text-zinc-300 w-8 text-right">
          {Math.round(opacity * 100)}%
        </span>
      </div>

      {selectedRegion && (
        <button
          id="delete-selected-region-btn"
          type="button"
          onClick={onDeleteSelectedRegion}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors"
          title="Delete selected filled region"
        >
          <Trash2 className="w-3 h-3" />
          <span>Delete</span>
        </button>
      )}
    </div>
  );
}
