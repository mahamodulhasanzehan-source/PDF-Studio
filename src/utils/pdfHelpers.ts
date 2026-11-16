import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  rgb,
  degrees,
  StandardFonts,
  BlendMode,
  LineCapStyle,
  LineJoinStyle,
  pushGraphicsState,
  popGraphicsState,
  setLineJoin,
} from 'pdf-lib';
import {
  AnnotationsState,
  ExtractedTextItem,
  PageDimension,
  CropBox,
  PageItem,
  RedactionAnnotation,
  ImageAnnotation,
  DrawingAnnotation,
  ShapeAnnotation,
  TextBoxAnnotation,
} from '../types/pdf';
import {
  hasNonWinAnsiCharacters,
  renderUnicodeTextBoxToPng,
  wrapWinAnsiText,
} from './textExportHelpers';

try {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
} catch (e) {
  console.warn('PDF.js worker initialization warning:', e);
}

export function hexToRgb(color: string): { r: number; g: number; b: number } {
  if (!color) return { r: 0, g: 0, b: 0 };
  if (color.startsWith('rgb')) {
    const match = color.match(/\d+(\.\d+)?/g);
    if (match && match.length >= 3) {
      return {
        r: Math.min(1, Math.max(0, parseFloat(match[0]) / 255)),
        g: Math.min(1, Math.max(0, parseFloat(match[1]) / 255)),
        b: Math.min(1, Math.max(0, parseFloat(match[2]) / 255)),
      };
    }
  }
  let cleaned = color.replace('#', '');
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(cleaned.substring(0, 6), 16) || 0;
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

export async function extractTextFromPage(
  pdfPage: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport
): Promise<ExtractedTextItem[]> {
  try {
    const textContent = await pdfPage.getTextContent();
    const items: ExtractedTextItem[] = [];

    textContent.items.forEach((item: any, index: number) => {
      if (!item.str || item.str.trim() === '') return;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
      const x = tx[4];
      const y = tx[5] - fontHeight;
      const width = item.width * (viewport.scale || 1);
      const height = fontHeight;

      items.push({
        id: `extracted-${pdfPage.pageNumber}-${index}`,
        page: pdfPage.pageNumber,
        text: item.str,
        x,
        y,
        width: Math.max(width, 20),
        height: Math.max(height, 12),
        fontSize: Math.round(fontHeight),
        fontFamily: item.fontName || 'sans-serif',
      });
    });

    return items;
  } catch (err) {
    console.warn('Text extraction error on page', pdfPage.pageNumber, err);
    return [];
  }
}

export function sampleCanvasPixel(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): string | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.floor((clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.floor((clientY - rect.top) * (canvas.height / rect.height));

  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;

  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const r = pixel[0].toString(16).padStart(2, '0');
    const g = pixel[1].toString(16).padStart(2, '0');
    const b = pixel[2].toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  } catch {
    return null;
  }
}

export function sampleRegionBackground(
  canvas: HTMLCanvasElement,
  pageX: number,
  pageY: number,
  baseWidth: number,
  baseHeight: number
): string {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx || baseWidth <= 0 || baseHeight <= 0) return '#ffffff';
    const px = Math.max(
      0,
      Math.min(canvas.width - 1, Math.floor((pageX / baseWidth) * canvas.width))
    );
    const py = Math.max(
      0,
      Math.min(canvas.height - 1, Math.floor((pageY / baseHeight) * canvas.height))
    );
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    const r = pixel[0].toString(16).padStart(2, '0');
    const g = pixel[1].toString(16).padStart(2, '0');
    const b = pixel[2].toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  } catch {
    return '#ffffff';
  }
}

export async function appendPdfDocuments(
  baseBytes: Uint8Array,
  newBytes: Uint8Array
): Promise<Uint8Array> {
  const baseDoc = await PDFDocument.load(baseBytes);
  const newDoc = await PDFDocument.load(newBytes);
  const copiedPages = await baseDoc.copyPages(newDoc, newDoc.getPageIndices());
  copiedPages.forEach((p) => baseDoc.addPage(p));
  return await baseDoc.save();
}

function normalizeAngle(angle: number): 0 | 90 | 180 | 270 {
  const norm = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  if (norm === 90 || norm === 180 || norm === 270) return norm;
  return 0;
}

function getEffectiveVisibleBox(page: PDFPage): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const mb = page.getMediaBox();
  let cb = mb;
  try {
    cb = page.getCropBox();
  } catch {
    cb = mb;
  }

  const left = Math.max(mb.x, cb.x);
  const bottom = Math.max(mb.y, cb.y);
  const right = Math.min(mb.x + mb.width, cb.x + cb.width);
  const top = Math.min(mb.y + mb.height, cb.y + cb.height);

  if (right > left + 0.5 && top > bottom + 0.5) {
    return { x: left, y: bottom, width: right - left, height: top - bottom };
  }
  return mb;
}

function clampNormalizedCrop(crop?: CropBox): {
  crop: CropBox;
  isCropped: boolean;
} {
  if (!crop) {
    return { crop: { x: 0, y: 0, width: 1, height: 1 }, isCropped: false };
  }
  const x = Math.max(0, Math.min(0.99, crop.x));
  const y = Math.max(0, Math.min(0.99, crop.y));
  const width = Math.max(0.01, Math.min(1 - x, crop.width));
  const height = Math.max(0.01, Math.min(1 - y, crop.height));
  const isCropped =
    x > 0.001 || y > 0.001 || width < 0.999 || height < 0.999;
  return {
    crop: isCropped ? { x, y, width, height } : { x: 0, y: 0, width: 1, height: 1 },
    isCropped,
  };
}

function computeUnrotatedCropBounds(
  visBox: { x: number; y: number; width: number; height: number },
  c: CropBox,
  normRot: 0 | 90 | 180 | 270
): { left: number; bottom: number; right: number; top: number } {
  const visLeft = visBox.x;
  const visBottom = visBox.y;
  const visRight = visBox.x + visBox.width;
  const visTop = visBox.y + visBox.height;
  const visW = visBox.width;
  const visH = visBox.height;

  if (normRot === 90) {
    return {
      bottom: visBottom + c.x * visH,
      top: visBottom + (c.x + c.width) * visH,
      left: visLeft + c.y * visW,
      right: visLeft + (c.y + c.height) * visW,
    };
  }
  if (normRot === 180) {
    return {
      right: visRight - c.x * visW,
      left: visRight - (c.x + c.width) * visW,
      bottom: visBottom + c.y * visH,
      top: visBottom + (c.y + c.height) * visH,
    };
  }
  if (normRot === 270) {
    return {
      top: visTop - c.x * visH,
      bottom: visTop - (c.x + c.width) * visH,
      right: visRight - c.y * visW,
      left: visRight - (c.y + c.height) * visW,
    };
  }
  return {
    left: visLeft + c.x * visW,
    right: visLeft + (c.x + c.width) * visW,
    top: visTop - c.y * visH,
    bottom: visTop - (c.y + c.height) * visH,
  };
}

async function rasterizeDataUrlToPng(dataUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 1;
        canvas.height = img.naturalHeight || img.height || 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Renders a single baked PDF page to an offscreen canvas with fill redactions burned in,
 * permanently destroying all underlying selectable/searchable text & vector paths.
 */
async function burnRedactedPageToPng(params: {
  singlePageBytes: Uint8Array;
  pageRedactions: RedactionAnnotation[];
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  finalW: number;
  finalH: number;
}): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const {
    singlePageBytes,
    pageRedactions,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    finalW,
    finalH,
  } = params;

  const renderScale = 2.5;
  const loadingTask = pdfjsLib.getDocument({ data: singlePageBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  try {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const ptToPxX = canvas.width / Math.max(1, finalW);
    const ptToPxY = canvas.height / Math.max(1, finalH);

    for (const r of pageRedactions) {
      ctx.save();
      ctx.globalAlpha = r.opacity !== undefined ? r.opacity : 1.0;
      ctx.fillStyle = r.fillColor || '#000000';

      if (r.points && r.points.length > 2) {
        ctx.beginPath();
        r.points.forEach((p, idx) => {
          const cx = (p.x * scaleX - offsetX) * ptToPxX;
          const cy = (p.y * scaleY - offsetY) * ptToPxY;
          if (idx === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.closePath();
        ctx.fill();
      } else {
        const cx = (r.x * scaleX - offsetX) * ptToPxX;
        const cy = (r.y * scaleY - offsetY) * ptToPxY;
        const cw = r.width * scaleX * ptToPxX;
        const ch = r.height * scaleY * ptToPxY;
        ctx.fillRect(cx, cy, cw, ch);
      }
      ctx.restore();
    }

    const dataUrl = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } finally {
    await pdfDoc.destroy();
  }
}

async function drawPageAnnotations(params: {
  outPage: PDFPage;
  outputDoc: PDFDocument;
  finalW: number;
  finalH: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  pageRedactions: RedactionAnnotation[];
  pageImages: ImageAnnotation[];
  pageDrawings: DrawingAnnotation[];
  pageShapes: ShapeAnnotation[];
  pageTexts: TextBoxAnnotation[];
  standardFonts: Record<string, PDFFont>;
  boldFonts: Record<string, PDFFont>;
  imageCache: Map<string, any>;
  pageNum: number;
}) {
  const {
    outPage,
    outputDoc,
    finalH,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    pageRedactions,
    pageImages,
    pageDrawings,
    pageShapes,
    pageTexts,
    standardFonts,
    boldFonts,
    imageCache,
    pageNum,
  } = params;

  const toPdfX = (vx: number) => vx * scaleX - offsetX;
  const toPdfY = (vy: number) => finalH - (vy * scaleY - offsetY);

  // 1. Redactions / Region Fills
  for (const r of pageRedactions) {
    const rgbColor = hexToRgb(r.fillColor);
    const opacity = r.opacity !== undefined ? r.opacity : 1.0;

    if (r.points && r.points.length > 2) {
      const svgPath = `M ${r.points
        .map((p) => `${(p.x * scaleX - offsetX).toFixed(2)} ${(p.y * scaleY - offsetY).toFixed(2)}`)
        .join(' L ')} Z`;
      try {
        outPage.drawSvgPath(svgPath, {
          x: 0,
          y: finalH,
          color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
          opacity,
        });
      } catch {
        outPage.drawRectangle({
          x: toPdfX(r.x),
          y: toPdfY(r.y + r.height),
          width: r.width * scaleX,
          height: r.height * scaleY,
          color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
          opacity,
        });
      }
    } else {
      outPage.drawRectangle({
        x: toPdfX(r.x),
        y: toPdfY(r.y + r.height),
        width: r.width * scaleX,
        height: r.height * scaleY,
        color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
        opacity,
      });
    }

    if (r.label) {
      const pdfX = toPdfX(r.x);
      const pdfY = toPdfY(r.y + r.height);
      const pdfHeight = r.height * scaleY;
      outPage.drawText(r.label, {
        x: pdfX + 4,
        y: pdfY + pdfHeight / 2 - 4,
        size: 8,
        font: standardFonts.Helvetica,
        color: rgb(1, 1, 1),
      });
    }
  }

  // 2. Embedded Images
  for (const img of pageImages) {
    try {
      let embeddedImage = imageCache.get(img.dataUrl);
      if (!embeddedImage) {
        if (img.mimeType === 'image/jpeg' || img.dataUrl.startsWith('data:image/jpeg')) {
          embeddedImage = await outputDoc.embedJpg(img.dataUrl);
        } else if (img.dataUrl.startsWith('data:image/png')) {
          embeddedImage = await outputDoc.embedPng(img.dataUrl);
        } else {
          const pngUrl = await rasterizeDataUrlToPng(img.dataUrl);
          if (pngUrl) {
            embeddedImage = await outputDoc.embedPng(pngUrl);
          }
        }
        if (embeddedImage) {
          imageCache.set(img.dataUrl, embeddedImage);
        }
      }
      if (!embeddedImage) continue;

      const pdfW = img.width * scaleX;
      const pdfH = img.height * scaleY;
      const rotDeg = img.rotation || 0;

      if (rotDeg === 0) {
        outPage.drawImage(embeddedImage, {
          x: toPdfX(img.x),
          y: toPdfY(img.y + img.height),
          width: pdfW,
          height: pdfH,
        });
      } else {
        const cx = toPdfX(img.x + img.width / 2);
        const cy = toPdfY(img.y + img.height / 2);
        const rad = (-rotDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = -pdfW / 2;
        const dy = -pdfH / 2;
        outPage.drawImage(embeddedImage, {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
          width: pdfW,
          height: pdfH,
          rotate: degrees(-rotDeg),
        });
      }
    } catch (err) {
      console.warn('Failed to embed image on page', pageNum, err);
    }
  }

  // 3. Vector Shapes (Line, Arrow, Rect, Ellipse)
  for (const s of pageShapes) {
    const strokeRgb = hexToRgb(s.color);
    const strokeW = Math.max(0.5, (s.strokeWidth || 2) * scaleX);
    const opacity = s.opacity !== undefined ? s.opacity : 1.0;
    const hasFill = Boolean(s.fillColor && s.fillColor !== 'transparent');
    const fillRgb = hasFill ? hexToRgb(s.fillColor!) : undefined;

    if (s.kind === 'line' || s.kind === 'arrow') {
      const sx1 = toPdfX(s.x1);
      const sy1 = toPdfY(s.y1);
      const sx2 = toPdfX(s.x2);
      const sy2 = toPdfY(s.y2);

      outPage.drawLine({
        start: { x: sx1, y: sy1 },
        end: { x: sx2, y: sy2 },
        thickness: strokeW,
        color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
        opacity,
        lineCap: LineCapStyle.Round,
      });

      if (s.kind === 'arrow') {
        const vx1 = s.x1 * scaleX - offsetX;
        const vy1 = s.y1 * scaleY - offsetY;
        const vx2 = s.x2 * scaleX - offsetX;
        const vy2 = s.y2 * scaleY - offsetY;
        const angle = Math.atan2(vy2 - vy1, vx2 - vx1);
        const headLen = Math.max(8, strokeW * 3.5);
        const spread = Math.PI / 6;
        const ax1 = vx2 - headLen * Math.cos(angle - spread);
        const ay1 = vy2 - headLen * Math.sin(angle - spread);
        const ax2 = vx2 - headLen * Math.cos(angle + spread);
        const ay2 = vy2 - headLen * Math.sin(angle + spread);

        const headPath = `M ${ax1.toFixed(2)} ${ay1.toFixed(2)} L ${vx2.toFixed(2)} ${vy2.toFixed(2)} L ${ax2.toFixed(2)} ${ay2.toFixed(2)}`;
        outPage.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
        outPage.drawSvgPath(headPath, {
          x: 0,
          y: finalH,
          borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
          borderWidth: strokeW,
          borderOpacity: opacity,
          borderLineCap: LineCapStyle.Round,
        });
        outPage.pushOperators(popGraphicsState());
      }
    } else if (s.kind === 'rect') {
      const minX = Math.min(s.x1, s.x2);
      const minY = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1) * scaleX;
      const h = Math.abs(s.y2 - s.y1) * scaleY;
      outPage.drawRectangle({
        x: toPdfX(minX),
        y: toPdfY(minY + Math.abs(s.y2 - s.y1)),
        width: w,
        height: h,
        borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
        borderWidth: strokeW,
        borderOpacity: opacity,
        color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
        opacity: fillRgb ? opacity : undefined,
      });
    } else if (s.kind === 'ellipse') {
      const cx = toPdfX((s.x1 + s.x2) / 2);
      const cy = toPdfY((s.y1 + s.y2) / 2);
      const xScale = (Math.abs(s.x2 - s.x1) * scaleX) / 2;
      const yScale = (Math.abs(s.y2 - s.y1) * scaleY) / 2;
      outPage.drawEllipse({
        x: cx,
        y: cy,
        xScale: Math.max(1, xScale),
        yScale: Math.max(1, yScale),
        borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
        borderWidth: strokeW,
        borderOpacity: opacity,
        color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
        opacity: fillRgb ? opacity : undefined,
      });
    }
  }

  // 4. Freehand Drawings & Highlighters (single continuous rounded path)
  for (const d of pageDrawings) {
    if (!d.points || d.points.length === 0) continue;
    const rgbColor = hexToRgb(d.color);
    const strokeWidth = Math.max(0.5, (d.strokeWidth || 2) * scaleX);
    const opacity =
      d.opacity !== undefined ? d.opacity : d.isHighlighter ? 0.35 : 1.0;

    const svgPts = d.points.map((p) => ({
      x: p.x * scaleX - offsetX,
      y: p.y * scaleY - offsetY,
    }));

    const deduped = [svgPts[0]];
    for (let i = 1; i < svgPts.length; i++) {
      const prev = deduped[deduped.length - 1];
      if (Math.hypot(svgPts[i].x - prev.x, svgPts[i].y - prev.y) >= 0.05 || i === svgPts.length - 1) {
        deduped.push(svgPts[i]);
      }
    }

    const svgPath =
      deduped.length === 1
        ? `M ${deduped[0].x.toFixed(2)} ${deduped[0].y.toFixed(2)} L ${(deduped[0].x + 0.01).toFixed(2)} ${deduped[0].y.toFixed(2)}`
        : `M ${deduped[0].x.toFixed(2)} ${deduped[0].y.toFixed(2)} ` +
          deduped
            .slice(1)
            .map((pt) => `L ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
            .join(' ');

    outPage.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
    outPage.drawSvgPath(svgPath, {
      x: 0,
      y: finalH,
      borderColor: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
      borderWidth: strokeWidth,
      borderOpacity: opacity,
      borderLineCap: LineCapStyle.Round,
      blendMode: d.isHighlighter ? BlendMode.Multiply : BlendMode.Normal,
    });
    outPage.pushOperators(popGraphicsState());
  }

  // 5. Text Boxes (with original-text mask, word wrapping, and Unicode fallback)
  for (const t of pageTexts) {
    if (!t.text && !t.maskOriginalText) continue;

    if (t.maskOriginalText) {
      const mr = t.maskRect || { x: t.x, y: t.y, width: t.width, height: t.height };
      const maskRgb = hexToRgb(t.maskColor || '#ffffff');
      outPage.drawRectangle({
        x: toPdfX(mr.x),
        y: toPdfY(mr.y + mr.height),
        width: mr.width * scaleX,
        height: mr.height * scaleY,
        color: rgb(maskRgb.r, maskRgb.g, maskRgb.b),
        opacity: 1.0,
      });
    }

    if (!t.text) continue;

    if (hasNonWinAnsiCharacters(t.text)) {
      const pngUrl = await renderUnicodeTextBoxToPng(t, 3);
      if (pngUrl) {
        try {
          const emb = await outputDoc.embedPng(pngUrl);
          outPage.drawImage(emb, {
            x: toPdfX(t.x),
            y: toPdfY(t.y + t.height),
            width: t.width * scaleX,
            height: t.height * scaleY,
          });
          continue;
        } catch {
          // Fallback to stripped WinAnsi vector text below
        }
      }
    }

    const font =
      t.fontWeight === 'bold'
        ? boldFonts[t.fontFamily] || boldFonts.Helvetica
        : standardFonts[t.fontFamily] || standardFonts.Helvetica;

    const rgbColor = hexToRgb(t.color);
    const fontSize = (t.fontSize || 14) * scaleY;
    const paddingOffset = 4;
    const maxBoxWidth = Math.max(fontSize, (t.width - paddingOffset * 2) * scaleX);
    const lines = wrapWinAnsiText(t.text, maxBoxWidth, font, fontSize);
    const lineHeight = fontSize * (t.lineHeight || 1.2);

    let currentY = toPdfY(t.y + paddingOffset) - fontSize * 0.88;

    for (const line of lines) {
      if (!line) {
        currentY -= lineHeight;
        continue;
      }

      const drawSingleLine = (textToDraw: string) => {
        let lineX = toPdfX(t.x + paddingOffset);
        if (t.textAlign === 'center' || t.textAlign === 'right') {
          const textWidth = font.widthOfTextAtSize(textToDraw, fontSize);
          const boxWidth = Math.max(0, (t.width - paddingOffset * 2) * scaleX);
          if (t.textAlign === 'center') {
            lineX += (boxWidth - textWidth) / 2;
          } else {
            lineX += boxWidth - textWidth;
          }
        }
        outPage.drawText(textToDraw, {
          x: lineX,
          y: currentY,
          size: fontSize,
          font,
          color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
        });
      };

      try {
        drawSingleLine(line);
      } catch {
        const asciiLine = line.replace(/[^\x20-\x7E]/g, '');
        if (asciiLine) drawSingleLine(asciiLine);
      }

      currentY -= lineHeight;
    }
  }
}

export async function exportPdfWithAnnotations(
  originalPdfBytes: Uint8Array,
  annotations: AnnotationsState,
  pageRotations: Record<number, number>,
  globalRotation: number,
  pageDimensions: Record<number, PageDimension>,
  crops: Record<number, CropBox> = {},
  pageInverts: Record<number, boolean> = {},
  globalInvert: boolean = false,
  pageOrder?: PageItem[],
  trueRedaction: boolean = false
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(originalPdfBytes);
  const srcPageCount = srcDoc.getPageCount();
  const outputDoc = await PDFDocument.create();

  const standardFonts: Record<string, PDFFont> = {
    Helvetica: await outputDoc.embedFont(StandardFonts.Helvetica),
    'Times-Roman': await outputDoc.embedFont(StandardFonts.TimesRoman),
    Courier: await outputDoc.embedFont(StandardFonts.Courier),
    Arial: await outputDoc.embedFont(StandardFonts.Helvetica),
    Georgia: await outputDoc.embedFont(StandardFonts.TimesRoman),
  };

  const boldFonts: Record<string, PDFFont> = {
    Helvetica: await outputDoc.embedFont(StandardFonts.HelveticaBold),
    'Times-Roman': await outputDoc.embedFont(StandardFonts.TimesRomanBold),
    Courier: await outputDoc.embedFont(StandardFonts.CourierBold),
    Arial: await outputDoc.embedFont(StandardFonts.HelveticaBold),
    Georgia: await outputDoc.embedFont(StandardFonts.TimesRomanBold),
  };

  const imageCache = new Map<string, any>();

  const targetPageNums: number[] =
    pageOrder && pageOrder.length > 0
      ? pageOrder
          .map((p) => p.pdfPageNum)
          .filter((n) => n >= 1 && n <= srcPageCount)
      : Array.from({ length: srcPageCount }, (_, i) => i + 1);

  for (const pageNum of targetPageNums) {
    const srcIdx = pageNum - 1;
    const srcPage = srcDoc.getPage(srcIdx);
    const mediaBox = srcPage.getMediaBox();
    const visBox = getEffectiveVisibleBox(srcPage);

    const currentRot = srcPage.getRotation().angle || 0;
    const addedRot = (pageRotations[pageNum] || 0) + globalRotation;
    const normRot = normalizeAngle(currentRot + addedRot);

    const visualW = normRot === 90 || normRot === 270 ? visBox.height : visBox.width;
    const visualH = normRot === 90 || normRot === 270 ? visBox.width : visBox.height;

    const { crop: c, isCropped } = clampNormalizedCrop(crops?.[pageNum]);
    const isPageInverted = Boolean(globalInvert || (pageInverts && pageInverts[pageNum]));

    const hasPreCropOrOffset =
      Math.abs(visBox.x) > 0.5 ||
      Math.abs(visBox.y) > 0.5 ||
      Math.abs(visBox.width - mediaBox.width) > 0.5 ||
      Math.abs(visBox.height - mediaBox.height) > 0.5;

    const pageRedactions = annotations.redactions.filter((r) => r.page === pageNum);
    const shouldBurnRedactions = trueRedaction && pageRedactions.length > 0;

    const needsBakedRebuild =
      isCropped ||
      normRot !== 0 ||
      hasPreCropOrOffset ||
      isPageInverted ||
      shouldBurnRedactions;

    const dim = pageDimensions[pageNum] || { width: visualW, height: visualH };
    const scaleX = visualW / (dim.width || visualW);
    const scaleY = visualH / (dim.height || visualH);
    const offsetX = c.x * visualW;
    const offsetY = c.y * visualH;

    let outPage: PDFPage;
    let finalW: number;
    let finalH: number;

    const hasPageContents = Boolean(srcPage.node.Contents());

    if (shouldBurnRedactions) {
      // Build a temporary isolated 1-page baked PDF, rasterize it with redactions burned in,
      // and embed the clean image page so underlying text & vectors are permanently destroyed.
      const tempDoc = await PDFDocument.create();
      const bounds = computeUnrotatedCropBounds(visBox, c, normRot);
      const rawBoundsW = Math.max(1, bounds.right - bounds.left);
      const rawBoundsH = Math.max(1, bounds.top - bounds.bottom);

      if (hasPageContents) {
        const emb = await tempDoc.embedPage(srcPage, bounds);
        finalW = Math.max(1, normRot === 90 || normRot === 270 ? emb.height : emb.width);
        finalH = Math.max(1, normRot === 90 || normRot === 270 ? emb.width : emb.height);

        const tempPage = tempDoc.addPage([finalW, finalH]);
        tempPage.setMediaBox(0, 0, finalW, finalH);
        tempPage.setCropBox(0, 0, finalW, finalH);
        tempPage.setRotation(degrees(0));

        if (normRot === 90) {
          tempPage.drawPage(emb, { x: 0, y: finalH, rotate: degrees(-90) });
        } else if (normRot === 180) {
          tempPage.drawPage(emb, { x: finalW, y: finalH, rotate: degrees(-180) });
        } else if (normRot === 270) {
          tempPage.drawPage(emb, { x: finalW, y: 0, rotate: degrees(-270) });
        } else {
          tempPage.drawPage(emb, { x: 0, y: 0 });
        }
      } else {
        finalW = Math.max(1, normRot === 90 || normRot === 270 ? rawBoundsH : rawBoundsW);
        finalH = Math.max(1, normRot === 90 || normRot === 270 ? rawBoundsW : rawBoundsH);
        const tempPage = tempDoc.addPage([finalW, finalH]);
        tempPage.drawRectangle({ x: 0, y: 0, width: finalW, height: finalH, color: rgb(1, 1, 1) });
      }

      const singlePageBytes = await tempDoc.save();
      const burnedPng = await burnRedactedPageToPng({
        singlePageBytes,
        pageRedactions,
        scaleX,
        scaleY,
        offsetX,
        offsetY,
        finalW,
        finalH,
      });

      outPage = outputDoc.addPage([finalW, finalH]);
      outPage.setMediaBox(0, 0, finalW, finalH);
      outPage.setCropBox(0, 0, finalW, finalH);
      outPage.setRotation(degrees(0));

      if (burnedPng) {
        const embPng = await outputDoc.embedPng(burnedPng);
        outPage.drawImage(embPng, { x: 0, y: 0, width: finalW, height: finalH });
      }
    } else if (needsBakedRebuild) {
      const bounds = computeUnrotatedCropBounds(visBox, c, normRot);
      const rawBoundsW = Math.max(1, bounds.right - bounds.left);
      const rawBoundsH = Math.max(1, bounds.top - bounds.bottom);

      if (hasPageContents) {
        const emb = await outputDoc.embedPage(srcPage, bounds);

        finalW = Math.max(1, normRot === 90 || normRot === 270 ? emb.height : emb.width);
        finalH = Math.max(1, normRot === 90 || normRot === 270 ? emb.width : emb.height);

        outPage = outputDoc.addPage([finalW, finalH]);
        outPage.setMediaBox(0, 0, finalW, finalH);
        outPage.setCropBox(0, 0, finalW, finalH);
        outPage.setRotation(degrees(0));

        if (isPageInverted) {
          outPage.drawRectangle({
            x: 0,
            y: 0,
            width: finalW,
            height: finalH,
            color: rgb(1, 1, 1),
          });
        }

        if (normRot === 90) {
          outPage.drawPage(emb, { x: 0, y: finalH, rotate: degrees(-90) });
        } else if (normRot === 180) {
          outPage.drawPage(emb, { x: finalW, y: finalH, rotate: degrees(-180) });
        } else if (normRot === 270) {
          outPage.drawPage(emb, { x: finalW, y: 0, rotate: degrees(-270) });
        } else {
          outPage.drawPage(emb, { x: 0, y: 0 });
        }
      } else {
        finalW = Math.max(1, normRot === 90 || normRot === 270 ? rawBoundsH : rawBoundsW);
        finalH = Math.max(1, normRot === 90 || normRot === 270 ? rawBoundsW : rawBoundsH);
        outPage = outputDoc.addPage([finalW, finalH]);
        outPage.setMediaBox(0, 0, finalW, finalH);
        outPage.setCropBox(0, 0, finalW, finalH);
        outPage.setRotation(degrees(0));
      }
    } else {
      const [copiedPage] = await outputDoc.copyPages(srcDoc, [srcIdx]);
      outPage = outputDoc.addPage(copiedPage);
      finalW = visBox.width;
      finalH = visBox.height;
    }

    await drawPageAnnotations({
      outPage,
      outputDoc,
      finalW,
      finalH,
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      pageRedactions: shouldBurnRedactions ? [] : pageRedactions,
      pageImages: annotations.images.filter((img) => img.page === pageNum),
      pageDrawings: annotations.drawings.filter((d) => d.page === pageNum),
      pageShapes: (annotations.shapes || []).filter((s) => s.page === pageNum),
      pageTexts: annotations.textboxes.filter((t) => t.page === pageNum),
      standardFonts,
      boldFonts,
      imageCache,
      pageNum,
    });

    if (isPageInverted) {
      outPage.drawRectangle({
        x: 0,
        y: 0,
        width: finalW,
        height: finalH,
        color: rgb(1, 1, 1),
        blendMode: BlendMode.Difference,
      });
    }
  }

  return await outputDoc.save();
}
