/** One Material's need against its current stock, at the moment of debit. */
export interface StockDebitLine {
  materialId: string;
  needed: number;
  stockQuantity: number;
}

export interface StockDebitResult {
  materialId: string;
  /**
   * `debited(material) = min(need, stockQuantity)` — never negative, never
   * more than what is actually in stock. When stock does not cover the need,
   * the Material is debited down to zero instead of going negative; the
   * shortfall is simply not fulfilled here (CLAUDE.md section 9.2).
   */
  debited: number;
}

export function calculateStockDebit(lines: readonly StockDebitLine[]): StockDebitResult[] {
  return lines.map((line) => ({
    materialId: line.materialId,
    debited: Math.min(line.needed, line.stockQuantity),
  }));
}
