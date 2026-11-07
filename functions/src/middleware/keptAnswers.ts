import { NextFunction, Request, Response } from 'express';
import { Kept } from '../kept';
import { KEPT_MS } from '../limits';

interface Answer {
  status: number;
  body: unknown;
}

const answers = new Kept<Answer>(KEPT_MS.apiAnswer);

/**
 * Keeps each API answer for a few seconds, by its full path and query, so
 * that an integration polling faster than that reads Firestore no more
 * often. Runs after the key check, so only a caller with the club's key
 * gets a kept answer.
 *
 * Errors from our side (5xx) are not kept, so the next request tries again.
 * Express still sets an ETag on a kept answer, so a caller that sends
 * If-None-Match gets a 304 as before.
 */
export function keptAnswers(req: Request, res: Response, next: NextFunction): void {
  let settle: { keep: (answer: Answer) => void; drop: () => void } | undefined;
  const answer = answers.get(req.originalUrl, () => new Promise<Answer>((keep, drop) => {
    settle = { keep, drop: () => drop(new Error('not kept')) };
  }));

  if (!settle) {
    // Another request is reading this answer, or has read it.
    answer.then(
      (kept) => res.status(kept.status).json(kept.body),
      // That read was not kept, so this one reads afresh.
      () => next(),
    );
    return;
  }

  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 500) settle?.keep({ status: res.statusCode, body });
    else settle?.drop();
    settle = undefined;
    return json(body);
  };
  // A route that ends without JSON keeps nothing.
  res.on('close', () => settle?.drop());
  next();
}
