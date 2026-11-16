import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

interface SaveFileFilterMeta {
  description: string;
  mimeType: string;
  extensions: string[];
}

export function getSaveFileFilter(fileName: string): SaveFileFilterMeta {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') {
    return {
      description: 'PDF Document',
      mimeType: 'application/pdf',
      extensions: ['pdf'],
    };
  }
  if (ext === 'png') {
    return {
      description: 'PNG Image',
      mimeType: 'image/png',
      extensions: ['png'],
    };
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    return {
      description: 'JPEG Image',
      mimeType: 'image/jpeg',
      extensions: ['jpg', 'jpeg'],
    };
  }
  if (ext === 'webp') {
    return {
      description: 'WebP Image',
      mimeType: 'image/webp',
      extensions: ['webp'],
    };
  }
  if (ext === 'zip') {
    return {
      description: 'ZIP Archive',
      mimeType: 'application/zip',
      extensions: ['zip'],
    };
  }
  return {
    description: 'File',
    mimeType: 'application/octet-stream',
    extensions: ext ? [ext] : ['bin'],
  };
}

function triggerAnchorDownload(blob: Blob, defaultName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Prompts the user for a destination path using the native Tauri Save As dialog
 * (desktop app) or File System Access API (`showSaveFilePicker`), falling back to
 * standard browser download when a picker is unavailable or blocked by iframe sandbox.
 * Returns `false` if the user explicitly cancelled the dialog.
 */
export async function saveBlobWithDialog(
  blob: Blob,
  defaultName: string
): Promise<boolean> {
  const filter = getSaveFileFilter(defaultName);

  if (isTauri()) {
    const selectedPath = await save({
      title: 'Save File',
      defaultPath: defaultName,
      filters: [
        {
          name: filter.description,
          extensions: filter.extensions,
        },
      ],
    });

    if (!selectedPath) {
      return false;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(selectedPath, bytes);
    return true;
  }

  const pickerWin = window as unknown as {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (typeof pickerWin.showSaveFilePicker === 'function') {
    try {
      const handle = await pickerWin.showSaveFilePicker({
        suggestedName: defaultName,
        types: [
          {
            description: filter.description,
            accept: {
              [filter.mimeType]: filter.extensions.map((ext) => `.${ext}`),
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false;
      }
      // Cross-origin iframes (e.g. preview) or restricted contexts block showSaveFilePicker;
      // fall back cleanly to standard browser download.
    }
  }

  triggerAnchorDownload(blob, defaultName);
  return true;
}
