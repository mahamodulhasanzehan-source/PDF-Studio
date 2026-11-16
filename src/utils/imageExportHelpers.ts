import * as pdfjsLib from 'pdfjs-dist';
import {
  AnnotationsState,
  CropBox,
  PageDimension,
  PageItem,
} from '../types/pdf';
import { exportPdfWithAnnotations } from './pdfHelpers';

export type ImageExportFormat = 'png' | 'jpeg' | 'webp';

export interface ImageExportOptions {
  format: ImageExportFormat;
  scale: number;
  transparentBackground: boolean;
  quality?: number;
}

export interface ExportedPageImage {
  blob: Blob;
  extension: string;
  pageIndex: number;
  pdfPageNum: number;
}

function getFormatMeta(format: ImageExportFormat): {
  mimeType: string;
  extension: string;
  supportsAlpha: boolean;
} {
  if (format === 'jpeg') {
    return { mimeType: 'image/jpeg', extension: 'jpg', supportsAlpha: false };
  }
  if (format === 'webp') {
    return { mimeType: 'image/webp', extension: 'webp', supportsAlpha: true };
  }
  return { mimeType: 'image/png', extension: 'png', supportsAlpha: true };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to encode ${mimeType} image`));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Renders selected pages to PNG/JPEG/WebP using the exact baked-crop PDF export pipeline
 * so cropped-off regions are strictly excluded and PNG/WebP transparency is preserved.
 */
export async function exportPagesAsImages(
  originalPdfBytes: Uint8Array,
  annotations: AnnotationsState,
  pageRotations: Record<number, number>,
  globalRotation: number,
  pageDimensions: Record<number, PageDimension>,
  crops: Record<number, CropBox>,
  pageInverts: Record<number, boolean>,
  globalInvert: boolean,
  selectedPages: PageItem[],
  options: ImageExportOptions
): Promise<ExportedPageImage[]> {
  const exportedPdfBytes = await exportPdfWithAnnotations(
    originalPdfBytes,
    annotations,
    pageRotations,
    globalRotation,
    pageDimensions,
    crops,
    pageInverts,
    globalInvert,
    selectedPages
  );

  const { mimeType, extension, supportsAlpha } = getFormatMeta(options.format);
  const useTransparent = supportsAlpha && options.transparentBackground;
  const renderScale = Math.max(0.5, Math.min(4, options.scale || 2));
  const quality = options.quality ?? 0.92;

  const loadingTask = pdfjsLib.getDocument({ data: exportedPdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;
  const results: ExportedPageImage[] = [];

  try {
    for (let i = 0; i < pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i + 1);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const ctx = canvas.getContext('2d', { alpha: useTransparent });
      if (!ctx) {
        throw new Error('Could not initialize 2D canvas context');
      }

      if (useTransparent) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({
        canvasContext: ctx,
        viewport,
        background: useTransparent ? 'rgba(0,0,0,0)' : '#ffffff',
      }).promise;

      const blob = await canvasToBlob(canvas, mimeType, quality);
      results.push({
        blob,
        extension,
        pageIndex: i + 1,
        pdfPageNum: selectedPages[i]?.pdfPageNum ?? i + 1,
      });

      // Release canvas backing store promptly
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await pdfDoc.destroy();
  }

  return results;
}
