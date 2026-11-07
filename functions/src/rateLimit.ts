import { IncomingHttpHeaders } from 'http';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { RateLimitName } from './limits';
import { switches } from './switches';

/**
 * Limits on how often each caller may do something, counted in memory by
 * each function instance. Each limit is a bucket per caller that holds up
 * to [limit] requests and refills evenly over [per]: a caller may use the
 * whole bucket at once, then one more each [per] / [limit]. Counting in
 * memory costs nothing, where a counter in Firestore would cost a write
 * per request, more than the requests it guards against.
 *
 * Only so many callers are counted at once, so that requests from made up
 * addresses cannot fill an instance's memory. Past that, the one counted
 * longest ago is let go, and starts again with a full bucket.
 */
export class Buckets {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly most = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Takes one request from [key]'s bucket. Returns 0 if it was allowed,
   *  or how many milliseconds until it would be. */
  take(key: string, limit: number, per: number): number {
    const now = this.now();
    const bucket = this.buckets.get(key);
    let tokens = limit;
    if (bucket) {
      tokens = Math.min(limit, bucket.tokens + ((now - bucket.at) * limit) / per);
    }
    this.buckets.delete(key);
    if (tokens < 1) {
      this.buckets.set(key, { tokens, at: now });
      return Math.ceil(((1 - tokens) * per) / limit);
    }
    this.buckets.set(key, { tokens: tokens - 1, at: now });
    while (this.buckets.size > this.most) {
      this.buckets.delete(this.buckets.keys().next().value as string);
    }
    return 0;
  }

  /** Whether [key]'s bucket has a request left, without taking one. */
  has(key: string, limit: number, per: number): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket) return true;
    return bucket.tokens + ((this.now() - bucket.at) * limit) / per >= 1;
  }
}

const buckets = new Buckets();

/**
 * The addresses a request may have come from, to count it against each.
 *
 * Cloud Run adds the address that connected to it as the last entry of
 * X-Forwarded-For. Straight to a function, that is the caller. Through
 * Hosting it is a Google edge server, and Hosting has added the caller just
 * before it. Anything further left was sent by the caller and could be made
 * up. So the request counts against both of the last two: one of them is
 * always the caller, whichever way it came, and making up a header gets it
 * no fresh bucket. Callers that reach us through the same edge server share
 * its bucket too, which at our traffic costs nothing.
 */
export function callerAddresses(headers: IncomingHttpHeaders, socketAddress?: string): string[] {
  const header = headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : header ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const last = forwarded.slice(-2);
  if (last.length === 0 && socketAddress) last.push(socketAddress);
  return [...new Set(last)];
}

export interface Limited {
  /** The limit that was reached. */
  limit: RateLimitName;
  /** Seconds until the caller may try again. */
  retryAfter: number;
}

/**
 * Counts one request against [name] for each of [keys], and returns the
 * limit reached if any was, after logging it.
 */
export async function overLimit(
  name: RateLimitName,
  keys: string[],
  forwardedFor?: string | string[],
): Promise<Limited | null> {
  const { limit, per } = (await switches()).limits[name];
  let waitMs = 0;
  for (const key of keys) waitMs = Math.max(waitMs, buckets.take(`${name}:${key}`, limit, per));
  if (waitMs === 0) return null;
  // One structured line, so Logs Explorer can find it and an alert count it.
  logger.warn('Rate limited', { limit: name, keys, forwardedFor });
  return { limit: name, retryAfter: Math.ceil(waitMs / 1000) };
}

/** Whether every one of [keys] has a request left under [name], without
 *  counting one. For limits that count only failures. */
export async function withinLimit(name: RateLimitName, keys: string[]): Promise<boolean> {
  const { limit, per } = (await switches()).limits[name];
  return keys.every((key) => buckets.has(`${name}:${key}`, limit, per));
}

/** For a callable: stops with `resource-exhausted` while [name] is
 *  reached for any of [keys]. */
export async function requireWithinLimit(
  name: RateLimitName,
  keys: string[],
  forwardedFor?: string | string[],
): Promise<void> {
  const limited = await overLimit(name, keys, forwardedFor);
  if (limited) {
    throw new HttpsError(
      'resource-exhausted',
      `Too many tries. Try again in ${limited.retryAfter} seconds.`,
      { retryAfter: limited.retryAfter },
    );
  }
}

/** A callable's caller: the addresses it may have come from, and the
 *  header they were found in, for the log. */
export interface Caller {
  addresses: string[];
  forwardedFor?: string | string[];
}

export function callerOf(rawRequest: { headers: IncomingHttpHeaders; socket?: { remoteAddress?: string } }): Caller {
  return {
    addresses: callerAddresses(rawRequest.headers, rawRequest.socket?.remoteAddress),
    forwardedFor: rawRequest.headers['x-forwarded-for'],
  };
}

/** For a callable: stops with `permission-denied` for an address a super
 *  admin has blocked. */
export async function requireNotBlocked(caller: Caller): Promise<void> {
  const { blockedIps } = await switches();
  if (caller.addresses.some((address) => blockedIps.has(address))) {
    throw new HttpsError('permission-denied', 'This address is blocked.');
  }
}
