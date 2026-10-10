/**
 * Who may open a plot's public page (and therefore report it). Live plots, and —
 * so shared links and search results don't break — sold plots and plots paused
 * only because the weekly check went unanswered (shown as "not available", no
 * contact). Never plots the seller or an admin took down, unpublished plots, or
 * a blocked seller's.
 */
export function isPubliclyViewable(p: { status: string; hiddenReason: string | null; removedAt?: Date | null; seller: { isBlocked: boolean } }): boolean {
  if (p.seller.isBlocked || p.removedAt) return false;
  if (p.status === "ACTIVE" || p.status === "SOLD") return true;
  return p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED";
}
