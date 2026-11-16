import { PDFDocument, rgb } from 'pdf-lib';

export async function duplicatePdfPageBytes(
  originalBytes: Uint8Array,
  sourcePdfPageNum: number
): Promise<{ bytes: Uint8Array; newPageNum: number }> {
  const doc = await PDFDocument.load(originalBytes);
  const srcIndex = Math.max(0, Math.min(doc.getPageCount() - 1, sourcePdfPageNum - 1));
  const [copied] = await doc.copyPages(doc, [srcIndex]);
  doc.addPage(copied);
  const newPageNum = doc.getPageCount();
  const bytes = await doc.save();
  return { bytes, newPageNum };
}

export async function appendBlankPdfPageBytes(
  originalBytes: Uint8Array,
  width = 612,
  height = 792
): Promise<{ bytes: Uint8Array; newPageNum: number }> {
  const doc = await PDFDocument.load(originalBytes);
  const page = doc.addPage([Math.max(72, width), Math.max(72, height)]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
    color: rgb(1, 1, 1),
  });
  const newPageNum = doc.getPageCount();
  const bytes = await doc.save();
  return { bytes, newPageNum };
}

async function rasterizeImageToPngUrl(dataUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 800;
        canvas.height = img.naturalHeight || img.height || 600;
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

export async function createPdfFromImageFile(file: File): Promise<Uint8Array> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') resolve(e.target.result);
      else reject(new Error('Failed to read image file'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  const doc = await PDFDocument.create();
  const isJpeg =
    file.type === 'image/jpeg' || rawDataUrl.startsWith('data:image/jpeg');
  const isPng =
    file.type === 'image/png' || rawDataUrl.startsWith('data:image/png');

  let embedded;
  if (isJpeg) {
    embedded = await doc.embedJpg(rawDataUrl);
  } else if (isPng) {
    embedded = await doc.embedPng(rawDataUrl);
  } else {
    const pngUrl = await rasterizeImageToPngUrl(rawDataUrl);
    if (!pngUrl) throw new Error('Unsupported image format');
    embedded = await doc.embedPng(pngUrl);
  }

  // Fit comfortably inside max 1200pt while preserving exact image aspect ratio
  const maxDim = 1200;
  const scale =
    Math.max(embedded.width, embedded.height) > maxDim
      ? maxDim / Math.max(embedded.width, embedded.height)
      : 1;
  const pageW = Math.max(72, embedded.width * scale);
  const pageH = Math.max(72, embedded.height * scale);

  const page = doc.addPage([pageW, pageH]);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: pageW,
    height: pageH,
  });

  return await doc.save();
}
