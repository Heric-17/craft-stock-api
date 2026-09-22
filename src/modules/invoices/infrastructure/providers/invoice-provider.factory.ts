import { Injectable } from '@nestjs/common';

import { EnvService } from '../../../../config/env.service';
import { extractFederalUnit, type FederalUnit } from '../../domain/federal-unit';
import { UnsupportedFederalUnitError } from '../../domain/invoice.error';
import type {
  InvoiceProvider,
  InvoiceProviderFactory,
} from '../../domain/providers/invoice-provider';
import { OfficialWebserviceProvider } from './official-webservice.provider';
import { ScrapingRsProvider } from './scraping-rs.provider';
import { ScrapingSpProvider } from './scraping-sp.provider';

/**
 * Chooses which `InvoiceProvider` reads a given capture.
 *
 * Every implementation arrives through the constructor, already built by the
 * container, and this class only ever picks one of them. It never calls
 * `new`: an implementation constructed here would be outside the container,
 * losing its own dependencies, its scope and its lifecycle — `ScrapingRsProvider`
 * alone needs the HTTP client and the logger injected into it.
 *
 * The choice is made from the state that issued the note, which is read out
 * of the URL. Configuration can override it, which is how the official
 * webservice gets switched on for the whole installation the day a
 * certificate exists, without a line changing at any call site.
 */
@Injectable()
export class ScrapingInvoiceProviderFactory implements InvoiceProviderFactory {
  constructor(
    private readonly scrapingRs: ScrapingRsProvider,
    private readonly scrapingSp: ScrapingSpProvider,
    private readonly officialWebservice: OfficialWebserviceProvider,
    private readonly env: EnvService,
  ) {}

  create(url: string): InvoiceProvider {
    if (this.env.get('NFCE_PROVIDER') === 'OFFICIAL_WEBSERVICE') {
      return this.officialWebservice;
    }

    const federalUnit = extractFederalUnit(url);

    if (federalUnit === null) {
      throw new UnsupportedFederalUnitError(
        `No federal unit could be read from "${url}", so no NFC-e provider can be selected. The URL must carry a 44-digit access key or a state portal host name.`,
      );
    }

    return this.selectByFederalUnit(federalUnit, url);
  }

  private selectByFederalUnit(federalUnit: FederalUnit, url: string): InvoiceProvider {
    switch (federalUnit) {
      case 'RS':
        return this.scrapingRs;
      case 'SP':
        return this.scrapingSp;
      default:
        // Named out loud rather than quietly falling back to the RS scraper:
        // pointing one state's selectors at another state's portal produces a
        // structural failure at best, and a plausible wrong note at worst.
        throw new UnsupportedFederalUnitError(
          `NFC-e import is not available for ${federalUnit} (${url}). Implemented: RS.`,
        );
    }
  }
}
