/**
 * The client address for rate limiting: the x-forwarded-for entry our own reverse proxy added,
 * `trustedHops` from the right (nginx alone: 1; add one per CDN / load balancer in front). Entries
 * further left are whatever the client sent. No x-real-ip: without our proxy in front a client sets
 * it. Without x-forwarded-for: the socket address, else 'unknown'. Only the reverse proxy may reach
 * the app port, or a client can send its own x-forwarded-for. Event-bound: `requestClientIp(event)`.
 */
export function clientIpFrom(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
  trustedHops: number,
): string {
  const hops = (forwardedFor ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const n = Number.isInteger(trustedHops) && trustedHops > 0 ? trustedHops : 1;
  if (hops.length) return hops[Math.max(0, hops.length - n)]!;
  return socketAddress || 'unknown';
}
