export interface TrendDims {
  width: number;
  height: number;
  padding: number;
}

/** Evenly-spaced points scaled into the padded box; smoothed line + filled area. */
export function trendGeometry(
  values: number[],
  dims: TrendDims,
): { line: string; area: string; points: { x: number; y: number }[] } {
  const { width, height, padding } = dims;
  const n = values.length;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  // Zero baseline: the y-scale runs 0 → max, so a small month-over-month change
  // reads as a small change rather than a full-height swing (min→max autoscaling
  // exaggerated tiny deltas). Spend totals are always ≥ 0.
  const max = Math.max(...values);

  const points = values.map((v, i) => {
    const x = n <= 1 ? padding : padding + (innerW * i) / (n - 1);
    const y = max <= 0 ? padding + innerH : padding + innerH * (1 - v / max);
    return { x, y };
  });

  if (points.length === 0) return { line: '', area: '', points };

  // Catmull-Rom → cubic bezier for a smooth line.
  let line = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  const last = points[points.length - 1]!;
  const first = points[0]!;
  const area = `${line} L ${last.x} ${height - padding} L ${first.x} ${height - padding} Z`;

  return { line, area, points };
}
