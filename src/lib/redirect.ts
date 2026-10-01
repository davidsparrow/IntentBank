// Only allow same-origin relative paths as post-auth destinations (prevents open redirects).
export function safeNext(next: string | null | undefined, fallback = "/bank"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
