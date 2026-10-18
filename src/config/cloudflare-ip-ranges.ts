/**
 * The address ranges Cloudflare publishes for its edge servers, copied from
 * https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
 * (checked 2026-10-18).
 *
 * They change rarely, and a range missing here fails safe: the edge address of
 * a request is then mistaken for the client's, so the clients behind that edge
 * share one rate limit counter. It never lets a client choose its own address.
 * The `forwardedFor` field of the rate limit log line shows it when it happens.
 */
export const CLOUDFLARE_IP_RANGES: readonly string[] = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];
