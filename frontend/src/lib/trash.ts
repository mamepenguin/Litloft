const TRASH_RETENTION_DAYS = 30;

export function getDaysRemaining(deletedAt: string): number {
  const deletedDate = new Date(deletedAt);
  const expiresDate = new Date(deletedDate.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const remaining = Math.ceil((expiresDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}
