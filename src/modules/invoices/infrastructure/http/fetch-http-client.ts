import { Injectable } from '@nestjs/common';

import { HttpTransportError } from '../../domain/invoice.error';
import type { HttpClient, HttpResponse } from '../../domain/ports/http-client.port';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The state portals answer a plain browser request and nothing else, so the
 * client sends a browser's `User-Agent` and reads the body as text.
 *
 * It distinguishes the two failure modes the import flow treats differently:
 * a request that never produced a response becomes an `HttpTransportError`,
 * while a response that arrived carrying a 5xx is returned with its status,
 * for the caller to judge. Only the first is a fault of the transport.
 */
@Injectable()
export class FetchHttpClient implements HttpClient {
  async get(url: string, options: { timeoutMs?: number } = {}): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      return { status: response.status, body: await response.text() };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);

      throw new HttpTransportError(`GET ${url} did not complete: ${reason}`, cause);
    } finally {
      clearTimeout(timeout);
    }
  }
}
