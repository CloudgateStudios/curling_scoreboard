/**
 * Values each function instance keeps in memory for a short while, so that
 * a burst of requests for the same thing reads Firestore once rather than
 * once per request. Each instance has its own copy, so with several
 * instances running a value is read once by each.
 *
 * A value is kept from when its read started, and requests that arrive
 * while it is being read wait for that same read. A read that fails is not
 * kept, so the next request tries again.
 *
 * Only so many values are kept, so that requests for made up IDs cannot
 * fill an instance's memory. Past that, the oldest is let go.
 */
export class Kept<T> {
  private readonly values = new Map<string, { at: number; value: Promise<T> }>();

  constructor(
    private readonly keepMs: number,
    private readonly most = 1000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, read: () => Promise<T>): Promise<T> {
    const kept = this.values.get(key);
    if (kept && this.now() - kept.at < this.keepMs) return kept.value;

    const value = read();
    // Deleting first moves the key to the end, the newest.
    this.values.delete(key);
    this.values.set(key, { at: this.now(), value });
    value.catch(() => {
      if (this.values.get(key)?.value === value) this.values.delete(key);
    });
    while (this.values.size > this.most) {
      this.values.delete(this.values.keys().next().value as string);
    }
    return value;
  }

  get size(): number {
    return this.values.size;
  }
}
