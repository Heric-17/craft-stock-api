/**
 * Reading numbers off an NFC-e page, in the Brazilian convention: `.` groups
 * thousands and `,` opens the decimals, so `1.234,56` is one thousand two
 * hundred and thirty-four point five six.
 *
 * Every function here returns `null` for anything it cannot read, and never a
 * fallback zero. The caller turns that `null` into an
 * `InvoiceStructureChangedError`, which is the whole point: a price the
 * scraper failed to read has to stop the import, because a zero that reaches
 * `grossValue` becomes a zero `packageCost`, a zero `unitCost`, and a
 * suggested price computed as if the ingredient were free — all without a
 * single error being raised anywhere.
 *
 * Pure: no I/O, no framework, no Money. It hands back a canonical decimal
 * string, which is the only representation `Money.fromDecimalString` accepts
 * without going through a float.
 */

/**
 * The RS portal puts a non-breaking space between the label and the value.
 * `\s` already covers U+00A0 in JavaScript, so it needs no separate class.
 */
const BLANK_CHARACTERS = /\s/g;

/** Either a grouped amount (`1.234.567,89`) or an ungrouped one (`1234,89`). */
const GROUPED = /^(-?)(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/;
const UNGROUPED = /^(-?)(\d+)(?:,(\d+))?$/;

/**
 * Canonical decimal string for a Brazilian-formatted amount, or `null` when
 * the text is not one. An empty string is `null`, not zero: a field that is
 * blank on the page is a field the scraper could not read.
 */
export function parseBrazilianDecimal(raw: string): string | null {
  const cleaned = raw.replace(BLANK_CHARACTERS, '');

  if (cleaned.length === 0) {
    return null;
  }

  const match = GROUPED.exec(cleaned) ?? UNGROUPED.exec(cleaned);

  if (!match) {
    return null;
  }

  const [, sign, integerPart, fractionPart] = match;
  const digits = integerPart.replace(/\./g, '');

  return fractionPart === undefined ? `${sign}${digits}` : `${sign}${digits}.${fractionPart}`;
}

/**
 * Quantities are not money — they are fractional amounts of a consumption
 * unit (`0,146` kg), so they stay `number`. They still go through the same
 * parser, and still refuse to become zero on failure.
 */
export function parseBrazilianQuantity(raw: string): number | null {
  const decimal = parseBrazilianDecimal(raw);

  if (decimal === null) {
    return null;
  }

  const value = Number(decimal);

  return Number.isFinite(value) ? value : null;
}

/** An integer count, such as the note's own "Qtd. total de itens". */
export function parseInteger(raw: string): number | null {
  const cleaned = raw.replace(BLANK_CHARACTERS, '');

  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  return Number(cleaned);
}
