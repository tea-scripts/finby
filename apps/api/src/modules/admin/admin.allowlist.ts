/** Parse the ADMIN_EMAILS env string into a normalized list. */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Case-insensitive membership check. Empty allowlist denies everyone. */
export function isAllowedAdmin(email: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
