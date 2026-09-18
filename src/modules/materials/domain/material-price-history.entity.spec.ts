import { Money } from '../../../shared/domain/money/money';
import { InvalidMaterialError } from './material.error';
import { MaterialPriceHistory } from './material-price-history.entity';

describe('MaterialPriceHistory', () => {
  it('records a packageCost change', () => {
    const history = new MaterialPriceHistory({
      id: 'history-1',
      materialId: 'material-1',
      previousValue: Money.fromDecimalString('10.00'),
      newValue: Money.fromDecimalString('12.50'),
      origin: 'MANUAL_EDIT',
      changedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(history.previousValue.toCents()).toBe(1000);
    expect(history.newValue.toCents()).toBe(1250);
  });

  it('rejects a change where previousValue and newValue are the same', () => {
    expect(
      () =>
        new MaterialPriceHistory({
          id: 'history-1',
          materialId: 'material-1',
          previousValue: Money.fromDecimalString('10.00'),
          newValue: Money.fromDecimalString('10.00'),
          origin: 'INVOICE_SYNC',
          changedAt: new Date('2026-01-01T00:00:00Z'),
        }),
    ).toThrow(InvalidMaterialError);
  });
});
