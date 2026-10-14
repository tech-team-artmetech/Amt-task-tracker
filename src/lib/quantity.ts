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

/**
 * How many units a task card is worth, and how many of them are finished.
 * A card like "Chhedas x 2" counts as 2 units. The stored totalQuantity wins when it is set
 * above 1; otherwise the multiplier in the task text is used (same rule the server uses).
 */
export function getTaskUnits(task: {
  text?: string;
  completed?: boolean;
  totalQuantity?: number | null;
  completedQuantity?: number | null;
}): { total: number; done: number } {
  const stored = Number(task.totalQuantity) || 0;
  const total = stored > 1 ? Math.floor(stored) : extractTaskQuantity(task.text || '').totalQuantity;
  if (task.completed) return { total, done: total };
  const partial = Math.max(0, Math.floor(Number(task.completedQuantity) || 0));
  return { total, done: Math.min(total, partial) };
}
