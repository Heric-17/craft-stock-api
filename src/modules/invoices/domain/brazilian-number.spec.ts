import { parseBrazilianDecimal, parseBrazilianQuantity, parseInteger } from './brazilian-number';

describe('parseBrazilianDecimal', () => {
  it.each([
    ['1.234,56', '1234.56'],
    ['1.234.567,89', '1234567.89'],
    ['9,49', '9.49'],
    ['59,9', '59.9'],
    ['0,146', '0.146'],
    ['336,35', '336.35'],
    ['12', '12'],
    ['1.234', '1234'],
    ['-3,50', '-3.50'],
  ])('reads %s as %s', (raw, expected) => {
    expect(parseBrazilianDecimal(raw)).toBe(expected);
  });

  it('strips the non-breaking space the RS portal puts before the amount', () => {
    expect(parseBrazilianDecimal('  9,49')).toBe('9.49');
  });

  it('strips surrounding whitespace and newlines from the portal markup', () => {
    expect(parseBrazilianDecimal('\n\t\t 46,99 \n')).toBe('46.99');
  });

  it.each([
    ['', 'an empty field'],
    ['   ', 'a blank field'],
    ['abc', 'text'],
    ['R$', 'a currency symbol alone'],
    ['1.2.3', 'malformed grouping'],
    ['1,2,3', 'two decimal separators'],
    ['12.34', 'a dot used as a decimal separator, which this format never means'],
  ])('refuses %s (%s)', (raw) => {
    expect(parseBrazilianDecimal(raw)).toBeNull();
  });

  /**
   * The single most important property of this parser. The implementation it
   * replaces ended in `|| 0`, so a selector that stopped matching produced a
   * confident zero — which travels into packageCost, unitCost and the
   * suggested price of every product using the Material, with no error
   * anywhere. Null is what lets the caller raise one.
   */
  it('never substitutes zero for a value it could not read', () => {
    for (const unreadable of ['', 'não informado', '--', 'R$ ?']) {
      expect(parseBrazilianDecimal(unreadable)).not.toBe('0');
      expect(parseBrazilianDecimal(unreadable)).toBeNull();
    }
  });

  it('reads a genuine zero as zero', () => {
    expect(parseBrazilianDecimal('0,00')).toBe('0.00');
  });
});

describe('parseBrazilianQuantity', () => {
  it('reads a fractional quantity from a weighed line', () => {
    expect(parseBrazilianQuantity('0,146')).toBe(0.146);
  });

  it('reads a whole quantity', () => {
    expect(parseBrazilianQuantity('4')).toBe(4);
  });

  it('refuses what it cannot read instead of returning zero', () => {
    expect(parseBrazilianQuantity('Qtde.:')).toBeNull();
  });
});

describe('parseInteger', () => {
  it('reads the count of items the note reports', () => {
    expect(parseInteger('12')).toBe(12);
  });

  it('refuses a non-integer', () => {
    expect(parseInteger('12,5')).toBeNull();
    expect(parseInteger('')).toBeNull();
  });
});
