import { useRef, useState, useEffect, PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'motion/react';
import { X, Eraser, Check, PenLine } from 'lucide-react';

interface SignaturePadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (dataUrl: string, width: number, height: number) => void;
}

const PEN_COLORS = [
  { label: 'Ink Black', hex: '#0f172a' },
  { label: 'Navy Blue', hex: '#1d4ed8' },
  { label: 'Crimson', hex: '#b91c1c' },
];

export default function SignaturePadModal({
  isOpen,
  onClose,
  onInsert,
}: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [penColor, setPenColor] = useState('#0f172a');
  const [penWidth, setPenWidth] = useState(3);
  const [hasInk, setHasInk] = useState(false);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setHasInk(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getLocalPt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = getLocalPt(e);
    lastPtRef.current = pt;

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.fillStyle = penColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, penWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      setHasInk(true);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPtRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const pt = getLocalPt(e);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPtRef.current = pt;
    setHasInk(true);
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPtRef.current = null;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Trim transparent margins tightly around drawn signature
    const { width, height } = canvas;
    const imgData = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (imgData[(y * width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return;

    const pad = 12;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(width - cropX, maxX - minX + 1 + pad * 2);
    const cropH = Math.min(height - cropY, maxY - minY + 1 + pad * 2);

    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const outCtx = out.getContext('2d');
    if (!outCtx) return;
    outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const targetW = Math.min(200, Math.max(90, Math.round(cropW * 0.45)));
    const targetH = Math.max(24, Math.round(targetW * (cropH / cropW)));

    onInsert(out.toDataURL('image/png'), targetW, targetH);
    onClose();
  };

  return (
    <motion.div
      id="signature-pad-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg bg-[#11141B] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden text-zinc-100"
      >
        <div className="h-12 px-4 bg-[#151821] border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold">Draw Signature</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.07] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Ink</span>
              <div className="flex items-center gap-1.5">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setPenColor(c.hex)}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      penColor === c.hex
                        ? 'border-blue-400 scale-110 ring-2 ring-blue-500/40'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-[#0B0D11] border border-white/[0.08] rounded-md px-2 py-0.5">
              <span className="text-[11px] text-zinc-400 mr-1">Stroke</span>
              {[2, 3, 5, 7].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setPenWidth(w)}
                  className={`w-5 h-5 rounded text-[11px] font-mono tabular-nums ${
                    penWidth === w
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="relative bg-white rounded-lg border border-white/[0.15] overflow-hidden">
            <canvas
              ref={canvasRef}
              width={920}
              height={340}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full h-44 cursor-crosshair touch-none block"
            />
            {!hasInk && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-zinc-400 text-xs">
                Sign above with mouse, trackpad, or touch
              </div>
            )}
            <div className="absolute left-6 right-6 bottom-7 border-b border-dashed border-zinc-300 pointer-events-none" />
          </div>
        </div>

        <div className="px-4 py-3 bg-[#151821] border-t border-white/[0.08] flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-insert-signature"
              type="button"
              disabled={!hasInk}
              onClick={handleConfirm}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Insert Signature</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
