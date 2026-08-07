const DEFAULT_ADMIN_UIDS = [
  '5XgksHrgmyeGqqKFYGVjQVM0KGl1',
  'VldgsZCsJaOTrFT2uR2YvXxUe7o1',
];

/**
 * Gets the list of authorized admin UIDs for server-side environments (API routes).
 * Prioritizes ADMIN_UIDS, falling back to NEXT_PUBLIC_ADMIN_UIDS or default UIDs.
 */
export function getAdminUidsServer(): string[] {
  const envUids = process.env.ADMIN_UIDS || process.env.NEXT_PUBLIC_ADMIN_UIDS;
  if (!envUids) {
    return DEFAULT_ADMIN_UIDS;
  }
  const parsed = envUids
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ADMIN_UIDS;
}

/**
 * Gets the list of authorized admin UIDs for client-side environments (React components).
 */
export function getAdminUidsClient(): string[] {
  const envUids = process.env.NEXT_PUBLIC_ADMIN_UIDS;
  if (!envUids) {
    return DEFAULT_ADMIN_UIDS;
  }
  const parsed = envUids
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ADMIN_UIDS;
}

/**
 * Checks if the given UID belongs to an authorized admin user.
 */
export function isAdminUser(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const adminUids = getAdminUidsClient();
  return adminUids.includes(uid);
}
