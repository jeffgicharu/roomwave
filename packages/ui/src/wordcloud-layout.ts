export interface CloudWord {
  text: string;
  count: number;
}

export interface PlacedWord extends CloudWord {
  /** Centre of the word, in pixels from the top left of the area. */
  x: number;
  y: number;
  size: number;
  width: number;
  height: number;
  rank: number;
}

export type Measure = (text: string, size: number) => number;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Places words on a spiral out from the centre, biggest first, so the most
 * common answers sit in the middle. If they do not all fit, everything is
 * made smaller and placed again. A word keeps its place from the last layout
 * while it still fits there, so a new vote nudges the cloud instead of reshuffling it.
 */
export function layoutWords(
  words: CloudWord[],
  width: number,
  height: number,
  measure: Measure,
  /** Where each word sat last time: a word stays put while it still fits there. */
  previous: Map<string, { x: number; y: number }> = new Map(),
): PlacedWord[] {
  if (!words.length || width < 40 || height < 40) return [];
  const sorted = [...words].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  const most = sorted[0]!.count;
  const least = sorted[sorted.length - 1]!.count;
  const maxSize = Math.min(height * 0.24, width * 0.12);
  const minSize = Math.max(maxSize * 0.24, 11);
  const span = most - least;

  const sizeFor = (count: number) =>
    span === 0 ? (sorted.length === 1 ? maxSize : maxSize * 0.62) : minSize + (maxSize - minSize) * Math.sqrt((count - least) / span);

  const cx = width / 2;
  const cy = height / 2;
  const aspect = Math.min(width / height, 2.4);
  // An Archimedean spiral whose last turn reaches the corners.
  const steps = 1400;
  const turn = 0.25;
  const growth = Math.hypot(width / aspect, height) / 2 / (steps * turn);

  for (let attempt = 0, scale = 1; attempt < 7; attempt++, scale *= 0.84) {
    const placed: PlacedWord[] = [];
    const boxes: Box[] = [];
    let ok = true;

    for (const [rank, word] of sorted.entries()) {
      const size = Math.max(sizeFor(word.count) * scale, 9);
      const w = measure(word.text, size) + size * 0.5;
      const h = size * 1.12;
      let found: Box | null = null;
      const before = previous.get(word.text);
      if (before) {
        const box = { left: before.x - w / 2, top: before.y - h / 2, right: before.x + w / 2, bottom: before.y + h / 2 };
        const inside = box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height;
        if (inside && !boxes.some((other) => overlaps(box, other))) found = box;
      }

      for (let t = 0; !found && t < steps; t++) {
        const angle = t * turn;
        const radius = growth * angle;
        const x = cx + radius * Math.cos(angle) * aspect;
        const y = cy + radius * Math.sin(angle);
        const box = { left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2 };
        if (box.left < 0 || box.top < 0 || box.right > width || box.bottom > height) continue;
        if (boxes.some((other) => overlaps(box, other))) continue;
        found = box;
      }

      if (!found) {
        ok = false;
        break;
      }
      boxes.push(found);
      placed.push({
        ...word,
        rank,
        size,
        width: w,
        height: h,
        x: (found.left + found.right) / 2,
        y: (found.top + found.bottom) / 2,
      });
    }
    if (ok) return placed;
  }
  return [];
}

/** Without a canvas (while the page is being built), a fair guess of a word's width. */
export const estimateWidth: Measure = (text, size) => text.length * size * 0.56;
