import { PDFFont } from 'pdf-lib';
import { TextBoxAnnotation } from '../types/pdf';

const NON_WINANSI_RE = /[^\t\n\r\x20-\x7E\xA0-\xFF]/;

export function hasNonWinAnsiCharacters(text: string): boolean {
  return NON_WINANSI_RE.test(text);
}

/**
 * Word-wraps text into lines that fit inside maxWidth using actual PDF font metrics.
 */
export function wrapWinAnsiText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number
): string[] {
  const safeMaxWidth = Math.max(fontSize, maxWidth);
  const paragraphs = text.split('\n');
  const wrappedLines: string[] = [];

  for (const rawParagraph of paragraphs) {
    const cleanParagraph = rawParagraph.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    if (!cleanParagraph) {
      wrappedLines.push('');
      continue;
    }

    const words = cleanParagraph.split(/(\s+)/);
    let currentLine = '';

    for (const token of words) {
      if (!token) continue;
      const testLine = currentLine + token;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(testLine, fontSize);
      } catch {
        width = testLine.length * fontSize * 0.55;
      }

      if (width <= safeMaxWidth || currentLine === '') {
        if (width <= safeMaxWidth) {
          currentLine = testLine;
        } else {
          // Single token wider than box: split character by character
          let chunk = '';
          for (const ch of token) {
            const nextChunk = chunk + ch;
            let cw = 0;
            try {
              cw = font.widthOfTextAtSize(nextChunk, fontSize);
            } catch {
              cw = nextChunk.length * fontSize * 0.55;
            }
            if (cw > safeMaxWidth && chunk) {
              wrappedLines.push(chunk);
              chunk = ch;
            } else {
              chunk = nextChunk;
            }
          }
          currentLine = chunk;
        }
      } else {
        wrappedLines.push(currentLine.replace(/\s+$/, ''));
        currentLine = token.trimStart();
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine.replace(/\s+$/, ''));
    }
  }

  return wrappedLines;
}

/**
 * Rasterizes a TextBoxAnnotation containing Unicode / Emoji characters into a
 * high-DPI transparent PNG data URL so non-WinAnsi glyphs export identically to preview.
 */
export async function renderUnicodeTextBoxToPng(
  t: TextBoxAnnotation,
  renderScale = 3
): Promise<string | null> {
  if (typeof document === 'undefined') return null;

  const boxW = Math.max(10, t.width);
  const boxH = Math.max(10, t.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(boxW * renderScale));
  canvas.height = Math.max(1, Math.ceil(boxH * renderScale));

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;

  ctx.scale(renderScale, renderScale);

  const fontStack =
    t.fontFamily === 'Courier'
      ? '"JetBrains Mono", ui-monospace, monospace'
      : t.fontFamily === 'Times-Roman' || t.fontFamily === 'Georgia'
      ? 'Georgia, "Times New Roman", serif'
      : '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';

  const fontSize = t.fontSize || 14;
  const lineHeight = fontSize * (t.lineHeight || 1.2);
  const pad = 4;
  const maxTextW = Math.max(10, boxW - pad * 2);

  ctx.font = `${t.fontWeight === 'bold' ? 'bold' : 'normal'} ${fontSize}px ${fontStack}`;
  ctx.fillStyle = t.color || '#000000';
  ctx.textBaseline = 'top';

  const lines: string[] = [];
  for (const para of t.text.split('\n')) {
    if (!para) {
      lines.push('');
      continue;
    }
    const words = para.split(/(\s+)/);
    let curr = '';
    for (const tok of words) {
      if (!tok) continue;
      const test = curr + tok;
      if (ctx.measureText(test).width <= maxTextW || curr === '') {
        curr = test;
      } else {
        lines.push(curr.replace(/\s+$/, ''));
        curr = tok.trimStart();
      }
    }
    if (curr) lines.push(curr.replace(/\s+$/, ''));
  }

  let y = pad;
  for (const line of lines) {
    if (y > boxH) break;
    if (line) {
      const textW = ctx.measureText(line).width;
      let x = pad;
      if (t.textAlign === 'center') {
        x = pad + Math.max(0, (maxTextW - textW) / 2);
      } else if (t.textAlign === 'right') {
        x = pad + Math.max(0, maxTextW - textW);
      }
      ctx.fillText(line, x, y);
    }
    y += lineHeight;
  }

  return canvas.toDataURL('image/png');
}
