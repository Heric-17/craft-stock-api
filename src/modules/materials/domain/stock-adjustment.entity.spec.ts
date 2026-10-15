import { Money } from '../../../shared/domain/money/money';
import { InvalidStockAdjustmentError } from './material.error';
import { StockAdjustment, type StockAdjustmentProps } from './stock-adjustment.entity';

function buildProps(overrides: Partial<StockAdjustmentProps> = {}): StockAdjustmentProps {
  return {
    id: 'adjustment-1',
    materialId: 'material-1',
    kind: 'MANUAL_LOSS',
    quantityDelta: -1,
    reason: 'BREAKAGE',
    observation: null,
    costBasisAmount: Money.fromDecimalString('40.00'),
    costBasisQuantity: 1,
    reversedAdjustmentId: null,
    createdAt: new Date('2026-03-10T12:00:00Z'),
    ...overrides,
  };
}

describe('StockAdjustment', () => {
  describe('value', () => {
    it('is the quantity taken at the frozen cost', () => {
      const loss = new StockAdjustment(buildProps({ quantityDelta: -3 }));

      expect(loss.value.toDecimalString()).toBe('120.00');
    });

    // Dividing first would round R$ 0,028 a gram to R$ 0,03 and give R$ 3,60 for 120 g.
    it('multiplies before dividing, so a fractional unit cost is not rounded away', () => {
      const loss = new StockAdjustment(
        buildProps({
          quantityDelta: -120,
          costBasisAmount: Money.fromDecimalString('28.00'),
          costBasisQuantity: 1000,
        }),
      );

      expect(loss.value.toDecimalString()).toBe('3.36');
    });

    it('is positive whatever the direction of the delta', () => {
      const entry = new StockAdjustment(
        buildProps({ kind: 'MANUAL_ENTRY', quantityDelta: 2, reason: null }),
      );
      const correction = new StockAdjustment(
        buildProps({ kind: 'MANUAL_ADJUSTMENT', quantityDelta: -2, reason: null }),
      );

      expect(entry.value.toDecimalString()).toBe('80.00');
      expect(correction.value.toDecimalString()).toBe('80.00');
    });
  });

  describe('rules by kind', () => {
    it('requires a reason on a MANUAL_LOSS', () => {
      expect(() => new StockAdjustment(buildProps({ reason: null }))).toThrow(
        InvalidStockAdjustmentError,
      );
    });

    it.each(['MANUAL_ENTRY', 'MANUAL_ADJUSTMENT'] as const)(
      'refuses a reason on a %s: only a loss takes one',
      (kind) => {
        expect(
          () => new StockAdjustment(buildProps({ kind, quantityDelta: 1, reason: 'BREAKAGE' })),
        ).toThrow(InvalidStockAdjustmentError);
      },
    );

    it('refuses a MANUAL_LOSS that puts stock in', () => {
      expect(() => new StockAdjustment(buildProps({ quantityDelta: 1 }))).toThrow(
        InvalidStockAdjustmentError,
      );
    });

    it('refuses a MANUAL_ENTRY that takes stock out', () => {
      expect(
        () =>
          new StockAdjustment(
            buildProps({ kind: 'MANUAL_ENTRY', quantityDelta: -1, reason: null }),
          ),
      ).toThrow(InvalidStockAdjustmentError);
    });

    it('lets a count correction go either way', () => {
      for (const quantityDelta of [-5, 5]) {
        expect(
          () =>
            new StockAdjustment(
              buildProps({ kind: 'MANUAL_ADJUSTMENT', quantityDelta, reason: null }),
            ),
        ).not.toThrow();
      }
    });

    it('requires a REVERSAL to point at what it undoes, and nothing else to', () => {
      expect(
        () => new StockAdjustment(buildProps({ kind: 'REVERSAL', quantityDelta: 1, reason: null })),
      ).toThrow(InvalidStockAdjustmentError);
      expect(
        () => new StockAdjustment(buildProps({ reversedAdjustmentId: 'adjustment-0' })),
      ).toThrow(InvalidStockAdjustmentError);
    });

    it('refuses a zero delta, a non-positive cost basis quantity and a long observation', () => {
      expect(() => new StockAdjustment(buildProps({ quantityDelta: 0 }))).toThrow(
        InvalidStockAdjustmentError,
      );
      expect(() => new StockAdjustment(buildProps({ costBasisQuantity: 0 }))).toThrow(
        InvalidStockAdjustmentError,
      );
      expect(() => new StockAdjustment(buildProps({ observation: 'x'.repeat(501) }))).toThrow(
        InvalidStockAdjustmentError,
      );
    });
  });

  describe('reversing', () => {
    const at = new Date('2026-04-02T09:00:00Z');

    it('applies the opposite delta and points back at the original', () => {
      const loss = new StockAdjustment(buildProps({ quantityDelta: -3 }));

      const reversal = StockAdjustment.reversing(loss, {
        id: 'reversal-1',
        observation: 'lançado por engano',
        createdAt: at,
      });

      expect(reversal.kind).toBe('REVERSAL');
      expect(reversal.quantityDelta).toBe(3);
      expect(reversal.reversedAdjustmentId).toBe(loss.id);
      expect(reversal.materialId).toBe(loss.materialId);
      expect(reversal.reason).toBeNull();
      expect(reversal.observation).toBe('lançado por engano');
    });

    it('keeps the cost the original froze, so a reversed loss nets to exactly zero', () => {
      const loss = new StockAdjustment(
        buildProps({
          quantityDelta: -120,
          costBasisAmount: Money.fromDecimalString('28.00'),
          costBasisQuantity: 1000,
        }),
      );

      const reversal = StockAdjustment.reversing(loss, {
        id: 'reversal-1',
        observation: null,
        createdAt: at,
      });

      expect(reversal.costBasisAmount.equals(loss.costBasisAmount)).toBe(true);
      expect(reversal.costBasisQuantity).toBe(loss.costBasisQuantity);
      expect(reversal.value.equals(loss.value)).toBe(true);
    });

    it('cannot reverse a reversal', () => {
      const loss = new StockAdjustment(buildProps());
      const reversal = StockAdjustment.reversing(loss, {
        id: 'reversal-1',
        observation: null,
        createdAt: at,
      });

      expect(() =>
        StockAdjustment.reversing(reversal, { id: 'reversal-2', observation: null, createdAt: at }),
      ).toThrow(InvalidStockAdjustmentError);
    });

    it('reverses an entry into a loss-shaped delta without a reason', () => {
      const entry = new StockAdjustment(
        buildProps({ kind: 'MANUAL_ENTRY', quantityDelta: 4, reason: null }),
      );

      const reversal = StockAdjustment.reversing(entry, {
        id: 'reversal-1',
        observation: null,
        createdAt: at,
      });

      expect(reversal.quantityDelta).toBe(-4);
    });
  });
});
