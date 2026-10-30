/** Server-side reCAPTCHA v3 verification; opt-in when both keys are configured. */

export const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
export const RECAPTCHA_DEFAULT_MIN_SCORE = 0.5;
export const RECAPTCHA_TIMEOUT_MS = 5000;

export interface RecaptchaSettings {
  enabled: boolean;
  secret: string;
  minScore: number;
}

export type RecaptchaResult =
  | { ok: true }
  | { ok: false; status: 400; error: 'captcha_failed' }
  | { ok: false; status: 503; error: 'captcha_unavailable' };

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function getRecaptchaSettings(input: {
  secret?: unknown;
  siteKey?: unknown;
  minScore?: unknown;
}): RecaptchaSettings {
  const secret = String(input.secret ?? '').trim();
  const siteKey = String(input.siteKey ?? '').trim();
  const parsed = parseFloat(String(input.minScore ?? ''));
  const minScore = Number.isFinite(parsed) ? parsed : RECAPTCHA_DEFAULT_MIN_SCORE;
  return { enabled: !!secret && !!siteKey, secret, minScore };
}

const FAILED = { ok: false, status: 400, error: 'captcha_failed' } as const;
const UNAVAILABLE = { ok: false, status: 503, error: 'captcha_unavailable' } as const;

export async function verifyRecaptcha(opts: {
  settings: RecaptchaSettings;
  token: unknown;
  action: string;
  remoteip?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}): Promise<RecaptchaResult> {
  const { settings } = opts;
  if (!settings.enabled) return { ok: true };
  if (typeof opts.token !== 'string' || !opts.token) return FAILED;

  const form = new URLSearchParams({ secret: settings.secret, response: opts.token });
  if (opts.remoteip) form.set('remoteip', opts.remoteip);

  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? RECAPTCHA_TIMEOUT_MS);

  let data: { success?: unknown; score?: unknown; action?: unknown };
  try {
    const res = await doFetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    if (!res.ok) return UNAVAILABLE;
    data = (await res.json()) as typeof data;
  } catch {
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }

  if (!data || data.success !== true) return FAILED;
  if (typeof data.score !== 'number' || data.score < settings.minScore) return FAILED;
  if (data.action !== opts.action) return FAILED;
  return { ok: true };
}
