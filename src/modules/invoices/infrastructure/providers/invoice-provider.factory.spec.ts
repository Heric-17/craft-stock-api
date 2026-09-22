import { NotImplementedException } from '@nestjs/common';

import type { EnvService } from '../../../../config/env.service';
import type { Env } from '../../../../config/env.schema';
import { UnsupportedFederalUnitError } from '../../domain/invoice.error';
import type { HttpClient, HttpResponse } from '../../domain/ports/http-client.port';
import { OfficialWebserviceProvider } from './official-webservice.provider';
import { ScrapingInvoiceProviderFactory } from './invoice-provider.factory';
import { ScrapingRsProvider } from './scraping-rs.provider';
import { ScrapingSpProvider } from './scraping-sp.provider';

const NEVER_CALLED: HttpClient = {
  get: (): Promise<HttpResponse> => {
    throw new Error('The factory must not perform any I/O while selecting a provider.');
  },
};

function urlFor(ibgeCode: string): string {
  return `https://portal.example.gov.br/consulta?p=${ibgeCode}260600000000000000000000000000000000000000|2|1`;
}

function buildFactory(nfceProvider: Env['NFCE_PROVIDER'] = 'AUTO'): {
  factory: ScrapingInvoiceProviderFactory;
  rs: ScrapingRsProvider;
  sp: ScrapingSpProvider;
  official: OfficialWebserviceProvider;
} {
  // Every implementation is built once and handed to the factory, exactly as
  // the container does it. The factory is expected to return one of these
  // very instances — never something it constructed itself.
  const rs = new ScrapingRsProvider(NEVER_CALLED, {
    warn: () => undefined,
    error: () => undefined,
  } as never);
  const sp = new ScrapingSpProvider(NEVER_CALLED);
  const official = new OfficialWebserviceProvider();
  const env = { get: () => nfceProvider } as unknown as EnvService;

  return { factory: new ScrapingInvoiceProviderFactory(rs, sp, official, env), rs, sp, official };
}

describe('ScrapingInvoiceProviderFactory', () => {
  it('resolves a Rio Grande do Sul note to the RS scraper', () => {
    const { factory, rs } = buildFactory();

    expect(factory.create(urlFor('43'))).toBe(rs);
  });

  it('resolves a São Paulo note to the SP scraper', () => {
    const { factory, sp } = buildFactory();

    expect(factory.create(urlFor('35'))).toBe(sp);
  });

  it('resolves by portal host name when the URL carries no access key', () => {
    const { factory, rs } = buildFactory();

    expect(factory.create('https://www.sefaz.rs.gov.br/nfce/consulta')).toBe(rs);
  });

  /**
   * The factory only ever selects. An implementation built here with `new`
   * would sit outside the container, without the dependencies, scope and
   * lifecycle the container gave it — `ScrapingRsProvider` alone needs an
   * HTTP client and a logger injected.
   */
  it('returns the very instances it was given, never a new one', () => {
    const { factory, rs, sp } = buildFactory();

    expect(factory.create(urlFor('43'))).toBe(rs);
    expect(factory.create(urlFor('43'))).toBe(rs);
    expect(factory.create(urlFor('35'))).toBe(sp);
  });

  /**
   * Named out loud rather than quietly falling back to the RS scraper:
   * pointing one state's selectors at another state's portal produces a
   * structural failure at best and a plausible wrong note at worst.
   */
  it.each([
    ['31', 'MG'],
    ['33', 'RJ'],
    ['41', 'PR'],
    ['29', 'BA'],
  ])('fails explicitly for a state with no provider: %s (%s)', (code, federalUnit) => {
    const { factory } = buildFactory();

    expect(() => factory.create(urlFor(code))).toThrow(UnsupportedFederalUnitError);
    expect(() => factory.create(urlFor(code))).toThrow(new RegExp(federalUnit));
  });

  it('fails explicitly when no state can be read from the URL at all', () => {
    const { factory } = buildFactory();

    expect(() => factory.create('https://example.com/something')).toThrow(
      UnsupportedFederalUnitError,
    );
  });

  it('fails explicitly for an IBGE code that belongs to no state', () => {
    const { factory } = buildFactory();

    expect(() => factory.create(urlFor('99'))).toThrow(UnsupportedFederalUnitError);
  });

  it('lets configuration override the choice for the whole installation', () => {
    const { factory, official } = buildFactory('OFFICIAL_WEBSERVICE');

    expect(factory.create(urlFor('43'))).toBe(official);
  });
});

describe('the skeleton providers', () => {
  it('SP reports that it is not implemented rather than returning something wrong', () => {
    expect(() => new ScrapingSpProvider(NEVER_CALLED).fetchInvoice('https://x')).toThrow(
      NotImplementedException,
    );
  });

  it('the official webservice reports that it is not implemented', () => {
    expect(() => new OfficialWebserviceProvider().fetchInvoice('https://x')).toThrow(
      NotImplementedException,
    );
  });
});
