import { extractAccessKeyFromUrl, extractFederalUnit } from './federal-unit';

const RS_KEY = '43260600000000000000000000000000000000000000';
const SP_KEY = '35260600000000000000000000000000000000000000';
const MG_KEY = '31260600000000000000000000000000000000000000';

describe('extractFederalUnit', () => {
  it('reads the state out of the access key, which is where it is reliable', () => {
    expect(
      extractFederalUnit(`https://www.sefaz.rs.gov.br/NFCE/NFC-E-COM.aspx?p=${RS_KEY}|2|1|1|abc`),
    ).toBe('RS');
    expect(
      extractFederalUnit(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${SP_KEY}|2|1|1|abc`),
    ).toBe('SP');
    expect(extractFederalUnit(`https://portal.example.gov.br/consulta?p=${MG_KEY}`)).toBe('MG');
  });

  it('falls back to the portal host name when no key is in the URL', () => {
    expect(extractFederalUnit('https://www.sefaz.rs.gov.br/nfce/consulta')).toBe('RS');
  });

  it('prefers the access key over the host name', () => {
    // A note issued in SP consulted through a URL hosted on an RS domain:
    // the key is what says who issued it.
    expect(extractFederalUnit(`https://www.sefaz.rs.gov.br/consulta?p=${SP_KEY}`)).toBe('SP');
  });

  it('reads a key that the URL broke up with separators', () => {
    expect(
      extractFederalUnit(
        'https://portal.example.com/x?p=4326-0600-0000-0000-0000-0000-0000-0000-0000-0000-0000',
      ),
    ).toBe('RS');
  });

  it('reports an unrecognisable URL rather than guessing', () => {
    expect(extractFederalUnit('https://example.com/whatever')).toBeNull();
    expect(extractFederalUnit('not a url at all')).toBeNull();
  });

  it('reports an IBGE code that belongs to no state', () => {
    expect(
      extractFederalUnit('https://example.com/x?p=99260600000000000000000000000000000000000000'),
    ).toBeNull();
  });
});

describe('extractAccessKeyFromUrl', () => {
  it('pulls the 44-digit key out of the query string', () => {
    expect(extractAccessKeyFromUrl(`https://x.gov.br/p?p=${RS_KEY}|2|1`)).toBe(RS_KEY);
  });

  it('returns null when there is no key', () => {
    expect(extractAccessKeyFromUrl('https://x.gov.br/p')).toBeNull();
  });
});
