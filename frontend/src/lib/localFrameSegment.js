export function localFrameSegmentForLength(length) {
  const n = Math.max(1, length || 30);
  const start = Math.max(1, Math.round(n * 0.45));
  return Array.from({ length: Math.min(6, n) }, (_, i) => start + i).filter((r) => r >= 1 && r <= n);
}
