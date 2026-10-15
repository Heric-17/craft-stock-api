import { Money } from '../../../shared/domain/money/money';
import { StockLoss } from './stock-loss.entity';
import { buildStockLossDataset, type StockLossFact } from './stock-loss-dataset';
import type { StockLossReason } from './stock-loss-reason.enum';

function loss(input: {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  reason: StockLossReason;
  createdAt: string;
  costBasisAmount?: string;
  costBasisQuantity?: number;
}): StockLossFact {
  return {
    materialName: input.materialName,
    loss: new StockLoss({
      id: input.id,
      materialId: input.materialId,
      quantity: input.quantity,
      reason: input.reason,
      observation: null,
      costBasisAmount: Money.fromDecimalString(input.costBasisAmount ?? '40.00'),
      costBasisQuantity: input.costBasisQuantity ?? 1,
      createdAt: new Date(input.createdAt),
    }),
  };
}

const MARCH = { from: new Date('2026-03-01T03:00:00Z'), to: new Date('2026-04-01T03:00:00Z') };

describe('buildStockLossDataset', () => {
  it('lists every month of the range and every reason, zeros included', () => {
    const dataset = buildStockLossDataset(
      { from: new Date('2026-01-01T03:00:00Z'), to: new Date('2026-04-01T03:00:00Z') },
      [],
    );

    expect(dataset.byMonth.map((cell) => cell.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(dataset.byMonth.every((cell) => cell.lossCount === 0)).toBe(true);
    expect(dataset.byReason.map((cell) => cell.reason)).toEqual([
      'BREAKAGE',
      'EXPIRED',
      'SPOILAGE',
      'LOST',
      'OTHER',
    ]);
    expect(dataset.byReason.every((cell) => cell.lossValue.isZero())).toBe(true);
    expect(dataset.byMaterial).toEqual([]);
  });

  it('separates one month by reason and by material', () => {
    const dataset = buildStockLossDataset(MARCH, [
      loss({
        id: 'a',
        materialId: 'wine',
        materialName: 'Vinho',
        quantity: 1,
        reason: 'BREAKAGE',
        createdAt: '2026-03-05T15:00:00Z',
      }),
      loss({
        id: 'b',
        materialId: 'wine',
        materialName: 'Vinho',
        quantity: 2,
        reason: 'EXPIRED',
        createdAt: '2026-03-12T15:00:00Z',
      }),
      loss({
        id: 'c',
        materialId: 'flour',
        materialName: 'Farinha',
        quantity: 120,
        reason: 'BREAKAGE',
        createdAt: '2026-03-20T15:00:00Z',
        costBasisAmount: '28.00',
        costBasisQuantity: 1000,
      }),
    ]);

    expect(dataset.byMonth).toHaveLength(1);
    expect(dataset.byMonth[0]).toMatchObject({ month: '2026-03', lossCount: 3 });
    // 40,00 + 80,00 + 3,36
    expect(dataset.byMonth[0].lossValue.toDecimalString()).toBe('123.36');

    const reason = (name: StockLossReason) =>
      dataset.byReason.find((cell) => cell.reason === name) as (typeof dataset.byReason)[number];

    expect(reason('BREAKAGE').lossCount).toBe(2);
    expect(reason('BREAKAGE').lossValue.toDecimalString()).toBe('43.36');
    expect(reason('EXPIRED').lossCount).toBe(1);
    expect(reason('EXPIRED').lossValue.toDecimalString()).toBe('80.00');
    expect(reason('OTHER').lossCount).toBe(0);

    expect(dataset.byMaterial.map((cell) => cell.materialName)).toEqual(['Vinho', 'Farinha']);
    expect(dataset.byMaterial[0]).toMatchObject({ materialId: 'wine', lossCount: 2 });
    expect(dataset.byMaterial[0].lossValue.toDecimalString()).toBe('120.00');
    expect(dataset.byMaterial[1].lossValue.toDecimalString()).toBe('3.36');
  });

  it('adds up the value of each loss rounded to the cent, not the rounding of the sum', () => {
    // Each loss is 1 g of a R$ 28,00 / 1000 g flour: 2,8 cents, rounded to 3.
    // Three of them are 9 cents; rounding the exact 8,4 once would give 8.
    const facts = ['x', 'y', 'z'].map((id) =>
      loss({
        id,
        materialId: 'flour',
        materialName: 'Farinha',
        quantity: 1,
        reason: 'LOST',
        createdAt: '2026-03-10T15:00:00Z',
        costBasisAmount: '28.00',
        costBasisQuantity: 1000,
      }),
    );

    const dataset = buildStockLossDataset(MARCH, facts);

    expect(dataset.byMonth[0].lossValue.toDecimalString()).toBe('0.09');
  });

  it('puts a loss in the month of the business calendar, not of UTC', () => {
    // 21:30 on 31 March in Sao Paulo is already April in UTC.
    const dataset = buildStockLossDataset(
      { from: new Date('2026-03-01T03:00:00Z'), to: new Date('2026-05-01T03:00:00Z') },
      [
        loss({
          id: 'late',
          materialId: 'wine',
          materialName: 'Vinho',
          quantity: 1,
          reason: 'BREAKAGE',
          createdAt: '2026-04-01T00:30:00Z',
        }),
      ],
    );

    const march = dataset.byMonth.find((cell) => cell.month === '2026-03');
    const april = dataset.byMonth.find((cell) => cell.month === '2026-04');

    expect(march?.lossCount).toBe(1);
    expect(april?.lossCount).toBe(0);
  });

  it('orders the materials by value, biggest first, ties by name', () => {
    const dataset = buildStockLossDataset(MARCH, [
      loss({
        id: '1',
        materialId: 'b',
        materialName: 'Bolsa',
        quantity: 1,
        reason: 'LOST',
        createdAt: '2026-03-05T15:00:00Z',
      }),
      loss({
        id: '2',
        materialId: 'a',
        materialName: 'Açúcar',
        quantity: 1,
        reason: 'LOST',
        createdAt: '2026-03-05T15:00:00Z',
      }),
      loss({
        id: '3',
        materialId: 'c',
        materialName: 'Caixa',
        quantity: 5,
        reason: 'LOST',
        createdAt: '2026-03-05T15:00:00Z',
      }),
    ]);

    expect(dataset.byMaterial.map((cell) => cell.materialName)).toEqual([
      'Caixa',
      'Açúcar',
      'Bolsa',
    ]);
  });
});
