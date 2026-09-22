import { normalizeInvoiceUnit } from './invoice-unit';

describe('normalizeInvoiceUnit', () => {
  it.each([
    ['UND9', 'UN'],
    ['UN9', 'UN'],
    ['KG9', 'KG'],
    ['PCT9', 'PCT'],
    ['PC', 'PC'],
    ['kg', 'KG'],
  ])('normalizes %s to %s for display', (raw, display) => {
    const unit = normalizeInvoiceUnit(raw);

    expect(unit.display).toBe(display);
    expect(unit.recognized).toBe(true);
  });

  it('keeps the raw unit exactly as the note printed it', () => {
    expect(normalizeInvoiceUnit('UND9').raw).toBe('UND9');
  });

  /**
   * A suffix nobody recognises is shown as it came and flagged, never
   * discarded: dropping it would hide a portal change behind a field that
   * still looks plausible.
   */
  it('passes an unrecognised unit through and reports it', () => {
    const unit = normalizeInvoiceUnit('XYZ42');

    expect(unit.display).toBe('XYZ42');
    expect(unit.raw).toBe('XYZ42');
    expect(unit.recognized).toBe(false);
  });
});
