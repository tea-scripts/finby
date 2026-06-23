export interface ScrollMetrics {
  layoutMeasurement: { height: number };
  contentOffset: { y: number };
  contentSize: { height: number };
}

/** True when a scroll view is within `threshold` px of the bottom. */
export function isAtBottom(m: ScrollMetrics, threshold = 8): boolean {
  return m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - threshold;
}
