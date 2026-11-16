/**
 * Range parser and formatter for PDF page extraction.
 * Handles whitespace-insensitive parsing of expressions like "1, 5-8, 7, 19-50"
 */

export function parsePageRange(input: string, maxPages: number): number[] {
  if (!input || !input.trim()) return [];

  const selected = new Set<number>();
  // Split by comma
  const parts = input.split(',');

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    // Check for range like "5-8" or "5 - 8"
    if (part.includes('-')) {
      const bounds = part.split('-').map((s) => s.trim());
      if (bounds.length === 2) {
        const start = parseInt(bounds[0], 10);
        const end = parseInt(bounds[1], 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let p = from; p <= to; p++) {
            selected.add(p);
          }
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        selected.add(pageNum);
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

export function formatPageRange(pageNumbers: number[]): string {
  if (!pageNumbers || pageNumbers.length === 0) return '';

  const sorted = Array.from(new Set(pageNumbers)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current === rangeEnd + 1) {
      rangeEnd = current;
    } else {
      ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
      rangeStart = current;
      rangeEnd = current;
    }
  }

  ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
  return ranges.join(', ');
}
