export function formatDuration(seconds: number): string {
  // Ends recorded before the game clock existed carry a -1 sentinel, which
  // would otherwise render as "-1m".
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? `${fallback} ${err.message}` : fallback;
}
