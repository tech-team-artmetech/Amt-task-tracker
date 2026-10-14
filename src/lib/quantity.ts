/**
 * Utility to extract and manage task quantities (e.g. "Prefx x 2", "Reels x3", "2x posters", "(x4)")
 */
export function extractTaskQuantity(text: string): { totalQuantity: number; hasExplicitMultiplier: boolean } {
  if (!text) return { totalQuantity: 1, hasExplicitMultiplier: false };

  // 1. Matches "x2", "x 2", "x3", "x 4", "(x3)", "[x2]"
  const matchXAfter = text.match(/(?:^|\s|\(|\[)x\s*([2-9]|\d{2,})(?:\)|\]|\s|$)/i);
  if (matchXAfter && matchXAfter[1]) {
    const qty = parseInt(matchXAfter[1], 10);
    if (!isNaN(qty) && qty > 1) {
      return { totalQuantity: qty, hasExplicitMultiplier: true };
    }
  }

  // 2. Matches "2x", "3x", "4x", "(2x)", "[3x]"
  const matchXBefore = text.match(/(?:^|\s|\(|\[)([2-9]|\d{2,})\s*x(?:\)|\]|\s|$)/i);
  if (matchXBefore && matchXBefore[1]) {
    const qty = parseInt(matchXBefore[1], 10);
    if (!isNaN(qty) && qty > 1) {
      return { totalQuantity: qty, hasExplicitMultiplier: true };
    }
  }

  return { totalQuantity: 1, hasExplicitMultiplier: false };
}
