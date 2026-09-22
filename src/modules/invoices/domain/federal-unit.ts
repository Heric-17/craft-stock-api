/**
 * Working out which state's portal a captured QR Code URL points at.
 *
 * The reliable answer is inside the access key itself: its first two digits
 * are the IBGE code of the issuing state, and the key travels in the URL as
 * the `p` parameter. The host name is only a fallback, because the portals
 * do not agree on one naming scheme (`sefaz.rs.gov.br`, `nfce.fazenda.sp.gov.br`,
 * and a handful of states that answer from `sefazvirtual`).
 *
 * Pure: string in, two-letter code out. No HTTP, no framework.
 */

export const FEDERAL_UNITS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export type FederalUnit = (typeof FEDERAL_UNITS)[number];

/** IBGE state codes, which are the first two digits of every access key. */
const IBGE_CODE_TO_FEDERAL_UNIT: Record<string, FederalUnit> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
};

const ACCESS_KEY_IN_URL = /\d{44}/;
const HOSTNAME_FEDERAL_UNIT = /(?:^|\.)([a-z]{2})\.gov\.br$/;

/**
 * The state that issued the note behind this URL, or `null` when the URL
 * says nothing recognisable. Never guesses: a URL that carries neither a
 * readable access key nor a state host name is reported as unknown, so the
 * caller can fail out loud instead of quietly scraping the wrong portal.
 */
export function extractFederalUnit(url: string): FederalUnit | null {
  return fromAccessKey(url) ?? fromHostname(url);
}

/** The 44-digit access key carried in the URL, if there is one. */
export function extractAccessKeyFromUrl(url: string): string | null {
  const digitsOnly = url.replace(/[^\d]/g, '');
  const direct = ACCESS_KEY_IN_URL.exec(url);

  if (direct) {
    return direct[0];
  }

  // Some portals break the key up with separators inside the `p` parameter.
  return ACCESS_KEY_IN_URL.test(digitsOnly)
    ? (ACCESS_KEY_IN_URL.exec(digitsOnly) as RegExpExecArray)[0]
    : null;
}

function fromAccessKey(url: string): FederalUnit | null {
  const accessKey = extractAccessKeyFromUrl(url);

  return accessKey === null ? null : (IBGE_CODE_TO_FEDERAL_UNIT[accessKey.slice(0, 2)] ?? null);
}

function fromHostname(url: string): FederalUnit | null {
  let hostname: string;

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  const match = HOSTNAME_FEDERAL_UNIT.exec(hostname);

  if (!match) {
    return null;
  }

  const candidate = match[1].toUpperCase() as FederalUnit;

  return FEDERAL_UNITS.includes(candidate) ? candidate : null;
}
