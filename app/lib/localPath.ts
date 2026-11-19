// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * `raw` when it is a path on this site ("/account?tab=1"), else undefined: no scheme, no "//host" or
 * "/\host" (browsers read both as another host), no control characters (a tab or newline is dropped
 * by the URL parser, turning "/\t/evil.test" into "//evil.test"). For every redirect target that
 * comes from a query string (#14); pass the result to the router, never to `external: true`.
 */
export function localPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value.startsWith('/') || value[1] === '/' || value[1] === '\\' || CONTROL_CHARS.test(value)) return undefined;
  return value;
}
