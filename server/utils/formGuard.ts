import type { RateLimiter, RateLimitRule } from './rateLimit.ts';
import { verifyRecaptcha, type FetchLike, type RecaptchaSettings } from './recaptcha.ts';

/** Abuse checks for public form endpoints: rate limit → honeypot → reCAPTCHA. */

export const HONEYPOT_FIELD = 'website';

export type FormGuardResult =
  | { action: 'continue' }
  | { action: 'drop' }
  | { action: 'reject'; status: 429; error: 'rate_limited'; retryAfter: number }
  | { action: 'reject'; status: 400; error: 'captcha_failed' }
  | { action: 'reject'; status: 503; error: 'captcha_unavailable' };

export interface FormGuardInput {
  route: string;
  ip: string;
  body: unknown;
  rule: RateLimitRule;
  limiter: RateLimiter;
  recaptcha: RecaptchaSettings;
  action: string;
  fetch?: FetchLike;
}

export function isHoneypotFilled(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const value = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof value === 'string' && value.trim() !== '';
}

export async function guardFormRequest(input: FormGuardInput): Promise<FormGuardResult> {
  const limited = input.limiter.hit(`${input.route}:${input.ip}`, input.rule);
  if (!limited.allowed) {
    return { action: 'reject', status: 429, error: 'rate_limited', retryAfter: limited.retryAfter };
  }

  if (isHoneypotFilled(input.body)) return { action: 'drop' };

  const token =
    input.body && typeof input.body === 'object'
      ? (input.body as Record<string, unknown>).recaptchaToken
      : undefined;
  const captcha = await verifyRecaptcha({
    settings: input.recaptcha,
    token,
    action: input.action,
    remoteip: input.ip || undefined,
    fetch: input.fetch,
  });
  if (!captcha.ok) return { action: 'reject', status: captcha.status, error: captcha.error };

  return { action: 'continue' };
}
