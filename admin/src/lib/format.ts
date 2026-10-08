export function formatDuration(seconds: number): string {
  // Ends recorded before the game clock existed carry a -1 sentinel, which
  // would otherwise render as "-1m".
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** How long ago `then` was, to the nearest minute, hour or day. */
export function formatAgo(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? `${fallback} ${err.message}` : fallback;
}
