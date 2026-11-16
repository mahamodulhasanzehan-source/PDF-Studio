import { useState, useEffect, ChangeEvent } from 'react';
import { Pipette, Check } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onEyeDropperClick?: () => void;
}

const SOLID_PALETTES = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#fef08a',
  '#10b981',
  '#a7f3d0',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
  '#94a3b8',
  '#1e293b',
];

const ACCENT_PRESETS = [
  '#f59e0b',
  '#84cc16',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
];

export default function ColorPickerModal({
  color,
  onChange,
  onEyeDropperClick,
}: ColorPickerProps) {
  const [customHex, setCustomHex] = useState(color);

  useEffect(() => {
    setCustomHex(color);
  }, [color]);

  const handleCustomHexChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
    setCustomHex(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val);
    }
  };

  return (
    <div
      id="color-picker-palette"
      className="p-3 bg-[#161A23] rounded-lg shadow-2xl border border-white/[0.12] w-64 text-zinc-200 text-xs select-none"
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-semibold text-zinc-100">Color Palette</span>
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded border border-white/20"
            style={{ backgroundColor: color }}
            title={`Active: ${color}`}
          />
          {onEyeDropperClick && (
            <button
              id="eyedropper-btn"
              type="button"
              onClick={onEyeDropperClick}
              title="Sample color from page"
              className="p-1 hover:bg-white/[0.08] rounded text-zinc-300 hover:text-white border border-white/[0.1] transition-colors"
            >
              <Pipette className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mb-2.5">
        <div className="text-[11px] text-zinc-400 font-medium mb-1.5">
          Standard Swatches
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {SOLID_PALETTES.map((swatch) => {
            const isSelected = swatch.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  setCustomHex(swatch);
                  onChange(swatch);
                }}
                className={`w-6 h-6 rounded flex items-center justify-center border transition-transform ${
                  swatch === '#ffffff' ? 'border-zinc-400' : 'border-white/10'
                } ${isSelected ? 'ring-2 ring-blue-400 scale-110 z-10' : 'hover:scale-105'}`}
                style={{ backgroundColor: swatch }}
                title={swatch}
              >
                {isSelected && (
                  <Check
                    className={`w-3.5 h-3.5 ${
                      swatch === '#ffffff' || swatch === '#fef08a' || swatch === '#a7f3d0'
                        ? 'text-zinc-900'
                        : 'text-white'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[11px] text-zinc-400 font-medium mb-1.5">
          Accent Tones
        </div>
        <div className="flex gap-1.5">
          {ACCENT_PRESETS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => {
                setCustomHex(swatch);
                onChange(swatch);
              }}
              className="flex-1 h-5 rounded border border-white/10 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: swatch }}
              title={swatch}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2.5 border-t border-white/[0.08]">
        <input
          type="color"
          value={color.startsWith('#') && color.length === 7 ? color : '#000000'}
          onChange={(e) => {
            setCustomHex(e.target.value);
            onChange(e.target.value);
          }}
          className="w-7 h-7 rounded border border-white/[0.12] p-0 cursor-pointer bg-transparent"
          title="Choose custom color"
        />
        <div className="relative flex-1">
          <span className="absolute left-2 top-1.5 text-zinc-400 font-mono text-[11px]">
            #
          </span>
          <input
            type="text"
            value={customHex.replace('#', '')}
            onChange={handleCustomHexChange}
            maxLength={6}
            placeholder="000000"
            className="w-full pl-5 pr-2 py-1 bg-[#0B0D11] border border-white/[0.1] text-zinc-100 rounded font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
          />
        </div>
      </div>
    </div>
  );
}
