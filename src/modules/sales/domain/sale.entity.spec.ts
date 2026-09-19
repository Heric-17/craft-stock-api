import { InvalidSaleError } from './sale.error';
import { Sale } from './sale.entity';

function build(overrides: Partial<ConstructorParameters<typeof Sale>[0]> = {}): Sale {
  return new Sale({
    id: 'sale-1',
    customerName: 'Maria',
    customerContact: null,
    paymentMethod: 'PIX',
    paymentStatus: 'PENDING',
    productionStatus: 'PENDING',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('Sale', () => {
  it('tracks paymentStatus and productionStatus as independent axes', () => {
    const sale = build({ paymentStatus: 'PAID', productionStatus: 'PENDING' });

    expect(sale.paymentStatus).toBe('PAID');
    expect(sale.productionStatus).toBe('PENDING');
  });

  it('rejects an empty customerName', () => {
    expect(() => build({ customerName: ' ' })).toThrow(InvalidSaleError);
  });

  it('rejects an empty paymentMethod', () => {
    expect(() => build({ paymentMethod: '' })).toThrow(InvalidSaleError);
  });

  describe('update', () => {
    it('changes customer/payment-method fields without touching either status axis', () => {
      const sale = build({ paymentStatus: 'PAID', productionStatus: 'ASSEMBLED' });

      const updated = sale.update({ customerName: 'Joana' }, new Date('2026-01-02T00:00:00Z'));

      expect(updated.customerName).toBe('Joana');
      expect(updated.paymentStatus).toBe('PAID');
      expect(updated.productionStatus).toBe('ASSEMBLED');
      expect(updated).not.toBe(sale);
    });
  });

  describe('withPaymentStatus', () => {
    it('changes paymentStatus without touching productionStatus', () => {
      const sale = build({ paymentStatus: 'PENDING', productionStatus: 'ASSEMBLED' });

      const updated = sale.withPaymentStatus('PAID', new Date('2026-01-02T00:00:00Z'));

      expect(updated.paymentStatus).toBe('PAID');
      expect(updated.productionStatus).toBe('ASSEMBLED');
    });
  });

  describe('withProductionStatus', () => {
    it('changes productionStatus without touching paymentStatus', () => {
      const sale = build({ paymentStatus: 'PAID', productionStatus: 'PENDING' });

      const updated = sale.withProductionStatus('ASSEMBLED', new Date('2026-01-02T00:00:00Z'));

      expect(updated.productionStatus).toBe('ASSEMBLED');
      expect(updated.paymentStatus).toBe('PAID');
    });
  });
});
