export const HTTP_CLIENT = Symbol('HTTP_CLIENT');

export interface HttpResponse {
  status: number;
  body: string;
}

/**
 * The narrowest possible view of an outbound HTTP GET: a status and a body.
 * It exists so the scraper can be exercised against a fixture, and so the
 * transport failure mode can be exercised without one — neither test ever
 * touches the network.
 *
 * @throws HttpTransportError when there is no response at all: timeout,
 * refused connection, DNS failure. A response that arrived carrying a 5xx is
 * not a transport error — it is returned, and the caller decides.
 */
export interface HttpClient {
  get(url: string, options?: { timeoutMs?: number }): Promise<HttpResponse>;
}
