import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Pipette,
  Copy,
  Check,
  Minus,
  ArrowUpRight,
  Square,
  Circle,
  ShieldAlert,
  Eraser,
  PenTool,
} from 'lucide-react';
import {
  ToolMode,
  ShapeKind,
  TextBoxAnnotation,
  RedactionAnnotation,
  ShapeAnnotation,
  DrawingAnnotation,
} from '../types/pdf';
import ColorPickerModal from './ColorPickerModal';
import GradientPalette from './GradientPalette';

interface PropertiesBarProps {
  toolMode: ToolMode;
  selectedText: TextBoxAnnotation | null;
  onUpdateSelectedText: (updated: Partial<TextBoxAnnotation>, commit?: boolean) => void;
  onDeleteSelectedText: () => void;
  selectedRedaction: RedactionAnnotation | null;
  onUpdateSelectedRedaction: (
    updated: Partial<RedactionAnnotation>,
    commit?: boolean
  ) => void;
  onDeleteSelectedRedaction: () => void;
  selectedShape: ShapeAnnotation | null;
  onUpdateSelectedShape: (updated: Partial<ShapeAnnotation>, commit?: boolean) => void;
  onDeleteSelectedShape: () => void;
  selectedDrawing: DrawingAnnotation | null;
  onDeleteSelectedDrawing: () => void;
  shapeKind: ShapeKind;
  setShapeKind: (k: ShapeKind) => void;
  shapeFillEnabled: boolean;
  setShapeFillEnabled: (v: boolean) => void;
  shapeFillColor: string;
  setShapeFillColor: (c: string) => void;
  drawColor: string;
  setDrawColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  drawOpacity: number;
  setDrawOpacity: (o: number) => void;
  redactColor: string;
  setRedactColor: (c: string) => void;
  redactOpacity: number;
  setRedactOpacity: (o: number) => void;
  trueRedaction: boolean;
  onToggleTrueRedaction: () => void;
  textColor: string;
  setTextColor: (c: string) => void;
  onActivateEyeDropper: () => void;
  eyedropperSampledColor: string;
  onCommitHistory: (description: string) => void;
}

export default function PropertiesBar({
  toolMode,
  selectedText,
  onUpdateSelectedText,
  onDeleteSelectedText,
  selectedRedaction,
  onUpdateSelectedRedaction,
  onDeleteSelectedRedaction,
  selectedShape,
  onUpdateSelectedShape,
  onDeleteSelectedShape,
  selectedDrawing,
  onDeleteSelectedDrawing,
  shapeKind,
  setShapeKind,
  shapeFillEnabled,
  setShapeFillEnabled,
  shapeFillColor,
  setShapeFillColor,
  drawColor,
  setDrawColor,
  strokeWidth,
  setStrokeWidth,
  drawOpacity,
  setDrawOpacity,
  redactColor,
  setRedactColor,
  redactOpacity,
  setRedactOpacity,
  trueRedaction,
  onToggleTrueRedaction,
  textColor,
  setTextColor,
  onActivateEyeDropper,
  eyedropperSampledColor,
  onCommitHistory,
}: PropertiesBarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState<
    'draw' | 'redact' | 'text' | 'shapeStroke' | 'shapeFill' | null
  >(null);
  const [copiedColor, setCopiedColor] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const sliderDirtyRef = useRef(false);
  const sizeDirtyRef = useRef(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        if (colorPickerTarget) {
          onCommitHistory('Update Color');
        }
        setShowColorPicker(false);
      }
    };
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPicker, colorPickerTarget, onCommitHistory]);

  const activeColor =
    colorPickerTarget === 'draw'
      ? drawColor
      : colorPickerTarget === 'shapeStroke'
      ? selectedShape?.color || drawColor
      : colorPickerTarget === 'shapeFill'
      ? selectedShape?.fillColor && selectedShape.fillColor !== 'transparent'
        ? selectedShape.fillColor
        : shapeFillColor
      : colorPickerTarget === 'redact'
      ? selectedRedaction?.fillColor || redactColor
      : selectedText?.color || textColor;

  const handleColorChange = (newColor: string) => {
    if (colorPickerTarget === 'draw') {
      setDrawColor(newColor);
    } else if (colorPickerTarget === 'shapeStroke') {
      setDrawColor(newColor);
      if (selectedShape) {
        onUpdateSelectedShape({ color: newColor }, false);
      }
    } else if (colorPickerTarget === 'shapeFill') {
      setShapeFillColor(newColor);
      setShapeFillEnabled(true);
      if (selectedShape) {
        onUpdateSelectedShape({ fillColor: newColor }, false);
      }
    } else if (colorPickerTarget === 'redact') {
      setRedactColor(newColor);
      if (selectedRedaction) {
        onUpdateSelectedRedaction({ fillColor: newColor }, false);
      }
    } else {
      setTextColor(newColor);
      if (selectedText) {
        onUpdateSelectedText({ color: newColor }, false);
      }
    }
  };

  const handleCopyHex = () => {
    navigator.clipboard.writeText(eyedropperSampledColor);
    setCopiedColor(true);
    setTimeout(() => setCopiedColor(false), 1500);
  };

  const isTextContext = toolMode === 'text' || selectedText !== null;
  const isDrawContext = toolMode === 'draw' || toolMode === 'highlighter';
  const isShapeContext = toolMode === 'shape' || selectedShape !== null;
  const isRedactContext = toolMode === 'redact' || selectedRedaction !== null;
  const isEraserContext = toolMode === 'eraser';
  const isDrawingSelected = selectedDrawing !== null && !isDrawContext;
  const isEyedropperContext = toolMode === 'eyedropper';

  const hasAnyContext =
    isTextContext ||
    isDrawContext ||
    isShapeContext ||
    isRedactContext ||
    isEraserContext ||
    isDrawingSelected ||
    isEyedropperContext;

  const activeContextKey = isTextContext
    ? 'text'
    : isDrawContext
    ? `draw-${toolMode}`
    : isShapeContext
    ? 'shape'
    : isRedactContext
    ? 'redact'
    : isEraserContext
    ? 'eraser'
    : isDrawingSelected
    ? 'selected-drawing'
    : 'eyedropper';

  return (
    <AnimatePresence initial={false}>
      {hasAnyContext && (
        <motion.div
          id="properties-bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 40, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="bg-[#151821] border-b border-white/[0.08] text-zinc-200 flex items-center px-4 gap-4 text-xs select-none relative z-20 shrink-0 overflow-x-auto overflow-y-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeContextKey}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.14 }}
              className="flex items-center gap-4 shrink-0"
            >
      {/* 1. TEXT TOOL CONTROLS */}
      {isTextContext && (
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] font-medium text-zinc-400">Typography</span>

          <select
            id="text-font-family"
            value={selectedText?.fontFamily || 'Helvetica'}
            onChange={(e) => {
              const font = e.target.value as TextBoxAnnotation['fontFamily'];
              if (selectedText) {
                onUpdateSelectedText({ fontFamily: font }, true);
              }
            }}
            className="bg-[#0B0D11] border border-white/[0.1] rounded-md px-2 py-1 text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="Helvetica">Helvetica (Sans)</option>
            <option value="Times-Roman">Times (Serif)</option>
            <option value="Courier">Courier (Mono)</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
          </select>

          <div className="flex items-center bg-[#0B0D11] border border-white/[0.1] rounded-md">
            <span className="text-[11px] text-zinc-400 pl-2">Size</span>
            <input
              id="text-font-size"
              type="number"
              min="8"
              max="96"
              value={selectedText?.fontSize || 14}
              onChange={(e) => {
                const val = Math.max(8, Math.min(96, parseInt(e.target.value, 10) || 14));
                if (selectedText) {
                  sizeDirtyRef.current = true;
                  onUpdateSelectedText({ fontSize: val }, false);
                }
              }}
              onBlur={() => {
                if (sizeDirtyRef.current) {
                  sizeDirtyRef.current = false;
                  onCommitHistory('Change Font Size');
                }
              }}
              className="w-12 bg-transparent text-zinc-100 px-1.5 py-1 text-xs text-center focus:outline-none font-mono tabular-nums"
            />
          </div>

          <button
            id="text-bold-btn"
            type="button"
            onClick={() => {
              const newWeight =
                selectedText?.fontWeight === 'bold' ? 'normal' : 'bold';
              if (selectedText) {
                onUpdateSelectedText({ fontWeight: newWeight }, true);
              }
            }}
            className={`p-1.5 rounded-md border transition-colors ${
              selectedText?.fontWeight === 'bold'
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-[#0B0D11] text-zinc-300 border-white/[0.1] hover:text-white'
            }`}
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <div className="flex bg-[#0B0D11] border border-white/[0.1] rounded-md p-0.5">
            {(['left', 'center', 'right'] as const).map((align) => {
              const Icon =
                align === 'left'
                  ? AlignLeft
                  : align === 'center'
                  ? AlignCenter
                  : AlignRight;
              const isAlignActive =
                (selectedText?.textAlign || 'left') === align;
              return (
                <button
                  key={align}
                  type="button"
                  onClick={() => {
                    if (selectedText) {
                      onUpdateSelectedText({ textAlign: align }, true);
                    }
                  }}
                  className={`p-1 rounded transition-colors ${
                    isAlignActive
                      ? 'bg-white/[0.12] text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={`Align ${align}`}
                >
                  <Icon className="w-3 h-3" />
                </button>
              );
            })}
          </div>

          <button
            id="text-color-swatch"
            type="button"
            onClick={() => {
              setColorPickerTarget('text');
              setShowColorPicker((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-2 py-1 bg-[#0B0D11] border border-white/[0.1] rounded-md hover:bg-white/[0.06] transition-colors"
            title="Text Color"
          >
            <div
              className="w-3.5 h-3.5 rounded-sm border border-white/20"
              style={{ backgroundColor: selectedText?.color || textColor }}
            />
            <span className="text-[11px] font-mono text-zinc-300">
              {selectedText?.color || textColor}
            </span>
          </button>

          {selectedText && (
            <>
              <button
                type="button"
                onClick={() =>
                  onUpdateSelectedText(
                    {
                      maskOriginalText: !selectedText.maskOriginalText,
                      maskColor: selectedText.maskColor || '#ffffff',
                    },
                    true
                  )
                }
                className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                  selectedText.maskOriginalText
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                    : 'bg-[#0B0D11] border-white/[0.1] text-zinc-400 hover:text-white'
                }`}
                title="Mask underlying PDF text behind this box"
              >
                {selectedText.maskOriginalText ? 'Masking Behind' : 'Transparent Bg'}
              </button>

              <button
                id="delete-selected-text-btn"
                type="button"
                onClick={onDeleteSelectedText}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors ml-1"
                title="Delete text box"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 2. FREEHAND / HIGHLIGHTER CONTROLS */}
      {isDrawContext && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-medium text-zinc-400">
            {toolMode === 'highlighter' ? 'Highlighter' : 'Pen'}
          </span>

          <button
            id="draw-color-swatch"
            type="button"
            onClick={() => {
              setColorPickerTarget('draw');
              setShowColorPicker((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-2 py-1 bg-[#0B0D11] border border-white/[0.1] rounded-md hover:bg-white/[0.06] transition-colors"
            title="Stroke Color"
          >
            <div
              className="w-3.5 h-3.5 rounded-sm border border-white/20"
              style={{ backgroundColor: drawColor }}
            />
            <span className="text-[11px] font-mono text-zinc-300">{drawColor}</span>
          </button>

          <div className="flex items-center gap-1 bg-[#0B0D11] border border-white/[0.1] rounded-md px-2 py-0.5">
            <span className="text-[11px] text-zinc-400 mr-1">Width</span>
            {[1, 2, 4, 8, 14].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setStrokeWidth(w)}
                className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-mono tabular-nums transition-colors ${
                  strokeWidth === w
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-[#0B0D11] border border-white/[0.1] rounded-md px-2.5 py-1">
            <span className="text-[11px] text-zinc-400">Opacity</span>
            <input
              id="draw-opacity-slider"
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={drawOpacity}
              onChange={(e) => setDrawOpacity(parseFloat(e.target.value))}
              className="w-16 accent-blue-500 cursor-pointer h-1"
            />
            <span className="text-[11px] font-mono tabular-nums text-zinc-300 w-8 text-right">
              {Math.round(drawOpacity * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* 3. SHAPES & ARROWS CONTROLS */}
      {isShapeContext && (
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] font-medium text-zinc-400">Shape</span>

          <div className="flex items-center bg-[#0B0D11] border border-white/[0.1] rounded-md p-0.5">
            {(
              [
                ['line', 'Line', Minus],
                ['arrow', 'Arrow', ArrowUpRight],
                ['rect', 'Rectangle', Square],
                ['ellipse', 'Ellipse', Circle],
              ] as const
            ).map(([k, lbl, Icon]) => {
              const active = (selectedShape?.kind || shapeKind) === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setShapeKind(k);
                    if (selectedShape) {
                      onUpdateSelectedShape({ kind: k }, true);
                    }
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                    active
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title={lbl}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden md:inline">{lbl}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setColorPickerTarget('shapeStroke');
              setShowColorPicker((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-2 py-1 bg-[#0B0D11] border border-white/[0.1] rounded-md hover:bg-white/[0.06] transition-colors"
            title="Shape Stroke Color"
          >
            <div
              className="w-3.5 h-3.5 rounded-sm border border-white/20"
              style={{ backgroundColor: selectedShape?.color || drawColor }}
            />
            <span className="text-[11px] text-zinc-300">Stroke</span>
          </button>

          {(selectedShape?.kind === 'rect' ||
            selectedShape?.kind === 'ellipse' ||
            (!selectedShape && (shapeKind === 'rect' || shapeKind === 'ellipse'))) && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const nextEnabled = selectedShape
                    ? !(selectedShape.fillColor && selectedShape.fillColor !== 'transparent')
                    : !shapeFillEnabled;
                  setShapeFillEnabled(nextEnabled);
                  if (selectedShape) {
                    onUpdateSelectedShape(
                      { fillColor: nextEnabled ? shapeFillColor : 'transparent' },
                      true
                    );
                  }
                }}
                className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                  (selectedShape
                    ? Boolean(
                        selectedShape.fillColor &&
                          selectedShape.fillColor !== 'transparent'
                      )
                    : shapeFillEnabled)
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                    : 'bg-[#0B0D11] border-white/[0.1] text-zinc-400 hover:text-white'
                }`}
              >
                Fill
              </button>
              {(selectedShape
                ? Boolean(
                    selectedShape.fillColor && selectedShape.fillColor !== 'transparent'
                  )
                : shapeFillEnabled) && (
                <button
                  type="button"
                  onClick={() => {
                    setColorPickerTarget('shapeFill');
                    setShowColorPicker((prev) => !prev);
                  }}
                  className="p-1 bg-[#0B0D11] border border-white/[0.1] rounded-md"
                  title="Shape Fill Color"
                >
                  <div
                    className="w-3.5 h-3.5 rounded-sm border border-white/20"
                    style={{
                      backgroundColor:
                        selectedShape?.fillColor &&
                        selectedShape.fillColor !== 'transparent'
                          ? selectedShape.fillColor
                          : shapeFillColor,
                    }}
                  />
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 bg-[#0B0D11] border border-white/[0.1] rounded-md px-2 py-0.5">
            <span className="text-[11px] text-zinc-400 mr-1">Width</span>
            {[1, 2, 4, 8].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setStrokeWidth(w);
                  if (selectedShape) {
                    onUpdateSelectedShape({ strokeWidth: w }, true);
                  }
                }}
                className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-mono tabular-nums transition-colors ${
                  (selectedShape?.strokeWidth || strokeWidth) === w
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          {selectedShape && (
            <button
              type="button"
              onClick={onDeleteSelectedShape}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors"
              title="Delete shape"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          )}
        </div>
      )}

      {/* 4. FILLED REGION & TRUE REDACTION CONTROLS */}
      {isRedactContext && (
        <div className="flex items-center gap-3 shrink-0">
          <GradientPalette
            fillColor={selectedRedaction?.fillColor || redactColor}
            onChangeFillColor={(newColor, commit = true) => {
              setRedactColor(newColor);
              if (selectedRedaction) {
                onUpdateSelectedRedaction({ fillColor: newColor }, commit);
              }
            }}
            opacity={selectedRedaction?.opacity ?? redactOpacity}
            onChangeOpacity={(newOpacity) => {
              setRedactOpacity(newOpacity);
              if (selectedRedaction) {
                sliderDirtyRef.current = true;
                onUpdateSelectedRedaction({ opacity: newOpacity }, false);
              }
            }}
            onOpacityCommit={() => {
              if (sliderDirtyRef.current) {
                sliderDirtyRef.current = false;
                onCommitHistory('Change Fill Opacity');
              }
            }}
            selectedRegion={selectedRedaction}
            onDeleteSelectedRegion={onDeleteSelectedRedaction}
            onActivateEyeDropper={onActivateEyeDropper}
            onOpenColorModal={() => {
              setColorPickerTarget('redact');
              setShowColorPicker(true);
            }}
          />

          <button
            id="btn-toggle-true-redaction"
            type="button"
            onClick={onToggleTrueRedaction}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
              trueRedaction
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'bg-[#0B0D11] border-white/[0.1] text-zinc-400 hover:text-zinc-200'
            }`}
            title="Burn redactions into page pixels on export so underlying text is unrecoverable"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{trueRedaction ? 'True Redact: Burn-in' : 'Vector Fill'}</span>
          </button>
        </div>
      )}

      {/* 5. ERASER STATUS */}
      {isEraserContext && (
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
            <Eraser className="w-3.5 h-3.5" />
            <span>Stroke Eraser</span>
          </span>
          <span className="text-zinc-400 text-xs">
            Click or drag across pen strokes or shapes to remove them.
          </span>
        </div>
      )}

      {/* 6. SELECTED FREEHAND STROKE */}
      {isDrawingSelected && selectedDrawing && (
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <PenTool className="w-3.5 h-3.5 text-blue-400" />
            <span>Selected Stroke</span>
          </span>
          <button
            type="button"
            onClick={onDeleteSelectedDrawing}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* 7. EYEDROPPER STATUS */}
      {isEyedropperContext && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
            <Pipette className="w-3.5 h-3.5" />
            <span>EyeDropper</span>
          </span>
          <span className="text-zinc-400 text-xs">
            Click anywhere on a page to sample its color.
          </span>
          {eyedropperSampledColor && (
            <div className="flex items-center gap-2 bg-[#0B0D11] px-2 py-0.5 rounded-md border border-white/[0.1]">
              <div
                className="w-3.5 h-3.5 rounded-sm border border-white/20"
                style={{ backgroundColor: eyedropperSampledColor }}
              />
              <span className="font-mono text-[11px] text-zinc-200 uppercase">
                {eyedropperSampledColor}
              </span>
              <button
                type="button"
                onClick={handleCopyHex}
                className="p-0.5 text-zinc-400 hover:text-white transition-colors"
                title="Copy Hex"
              >
                {copiedColor ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          )}
        </div>
      )}

            </motion.div>
          </AnimatePresence>

          {/* COLOR PICKER POPOVER */}
          <AnimatePresence>
            {showColorPicker && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, scale: 0.94, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -6 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="fixed top-24 left-24 z-50 origin-top-left"
              >
                <ColorPickerModal
                  color={activeColor}
                  onChange={handleColorChange}
                  onEyeDropperClick={onActivateEyeDropper}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
