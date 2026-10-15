import { Money } from '../../../shared/domain/money/money';
import { InvalidStockLossError } from './material.error';
import { StockLoss, type StockLossProps } from './stock-loss.entity';

function buildProps(overrides: Partial<StockLossProps> = {}): StockLossProps {
  return {
    id: 'loss-1',
    materialId: 'material-1',
    quantity: 5,
    reason: 'BREAKAGE',
    observation: null,
    costBasisAmount: Money.fromDecimalString('1.00'),
    costBasisQuantity: 1,
    createdAt: new Date('2026-03-10T12:00:00Z'),
    ...overrides,
  };
}

describe('StockLoss', () => {
  describe('value', () => {
    it('is the quantity at the cost of the moment: 5 biscuits at R$ 1,00 are R$ 5,00', () => {
      expect(new StockLoss(buildProps()).value.toDecimalString()).toBe('5.00');
    });

    // Dividing first would round R$ 0,028 a gram to R$ 0,03 and give R$ 3,60 for 120 g.
    it('multiplies before dividing, so a fractional unit cost is not rounded away', () => {
      const loss = new StockLoss(
        buildProps({
          quantity: 120,
          costBasisAmount: Money.fromDecimalString('28.00'),
          costBasisQuantity: 1000,
        }),
      );

      expect(loss.value.toDecimalString()).toBe('3.36');
    });
  });

  describe('rules', () => {
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses a quantity of %p',
      (quantity) => {
        expect(() => new StockLoss(buildProps({ quantity }))).toThrow(InvalidStockLossError);
      },
    );

    it('refuses a cost basis quantity that is not positive', () => {
      expect(() => new StockLoss(buildProps({ costBasisQuantity: 0 }))).toThrow(
        InvalidStockLossError,
      );
    });

    it('refuses a negative cost basis amount', () => {
      expect(
        () => new StockLoss(buildProps({ costBasisAmount: Money.fromDecimalString('-1.00') })),
      ).toThrow(InvalidStockLossError);
    });

    it('refuses an observation above 500 characters', () => {
      expect(() => new StockLoss(buildProps({ observation: 'x'.repeat(501) }))).toThrow(
        InvalidStockLossError,
      );
    });

    it('accepts an observation of exactly 500 characters', () => {
      expect(() => new StockLoss(buildProps({ observation: 'x'.repeat(500) }))).not.toThrow();
    });
  });
});
