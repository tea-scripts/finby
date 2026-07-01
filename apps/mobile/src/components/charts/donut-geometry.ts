/** Dash lengths + cumulative offsets for a stroked-circle donut. Each segment i
 *  covers `values[i]/total` of `circumference`; `offset` is where it starts. */
export function donutSegments(
  values: number[],
  circumference: number,
): { length: number; offset: number }[] {
  const total = values.reduce((a, v) => a + (v > 0 ? v : 0), 0);
  const out: { length: number; offset: number }[] = [];
  let acc = 0;
  for (const v of values) {
    const length = total > 0 ? (Math.max(0, v) / total) * circumference : 0;
    out.push({ length, offset: acc });
    acc += length;
  }
  return out;
}
