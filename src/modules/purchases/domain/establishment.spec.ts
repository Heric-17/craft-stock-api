import { Establishment, establishmentIdOf } from './establishment';
import { InvalidPurchaseError } from './purchase.error';

describe('Establishment', () => {
  it('is identified by its CNPJ when it has one', () => {
    const establishment = new Establishment({
      name: 'ATACADAO S.A.',
      cnpj: '75.315.333/0088-60',
    });

    expect(establishment.id).toBe('75.315.333/0088-60');
  });

  it('holds two notes of the same shop together across a change of trading name', () => {
    const before = new Establishment({ name: 'ATACADAO S.A.', cnpj: '75.315.333/0088-60' });
    const after = new Establishment({ name: 'ATACADAO ZONA SUL', cnpj: '75.315.333/0088-60' });

    // The shop keeps its CNPJ while its name changes, and a spending panel
    // that split it in two would report the same shop as two.
    expect(before.equals(after)).toBe(true);
  });

  it('falls back to the name for a purchase entered by hand', () => {
    const establishment = new Establishment({ name: 'Feira do bairro', cnpj: null });

    expect(establishment.id).toBe('Feira do bairro');
  });

  it('refuses a shop with no name', () => {
    expect(() => new Establishment({ name: '   ', cnpj: null })).toThrow(InvalidPurchaseError);
  });

  it('applies the same rule to raw values, which is what the adapters group by', () => {
    expect(establishmentIdOf('ATACADAO S.A.', '75.315.333/0088-60')).toBe('75.315.333/0088-60');
    expect(establishmentIdOf('Feira do bairro', null)).toBe('Feira do bairro');
    expect(establishmentIdOf('Feira do bairro', '  ')).toBe('Feira do bairro');
    expect(establishmentIdOf(null, null)).toBeNull();
  });
});
