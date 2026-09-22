/**
 * The unit column of an NFC-e arrives with a numeric suffix the till appends
 * (`UND9`, `KG9`, `PCT9`). Normalising it is a display concern and nothing
 * more: it makes the line readable while the user classifies it.
 *
 * It is never the source of truth for stock. The note says a package of
 * cheese is one package; what the kitchen consumes is the 200 g inside it.
 * Only the user knows that, so `packageQuantity` is always typed by the user
 * at classification time and never inferred from here.
 *
 * A suffix nobody recognises is passed through unchanged and reported, never
 * dropped: silently discarding it would hide a portal change behind a field
 * that still looks plausible.
 */

const KNOWN_UNITS = [
  'UN',
  'UND',
  'KG',
  'G',
  'MG',
  'L',
  'ML',
  'PCT',
  'CX',
  'PC',
  'DZ',
  'FD',
  'BDJ',
] as const;

/** `UND9` -> `UND`, `KG9` -> `KG`. Nothing else is touched. */
const TRAILING_TILL_SUFFIX = /\d+$/;

export interface NormalizedUnit {
  /** What to show next to the line. */
  display: string;
  /** The unit exactly as the note printed it. */
  raw: string;
  /** False when the unit is not one we recognise — worth a log line, never a silent drop. */
  recognized: boolean;
}

export function normalizeInvoiceUnit(raw: string): NormalizedUnit {
  const trimmed = raw.trim();
  const candidate = trimmed.toUpperCase().replace(TRAILING_TILL_SUFFIX, '');

  if ((KNOWN_UNITS as readonly string[]).includes(candidate)) {
    return { display: candidate === 'UND' ? 'UN' : candidate, raw: trimmed, recognized: true };
  }

  return { display: trimmed, raw: trimmed, recognized: false };
}
