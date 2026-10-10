export const DEVELOPMENT_CORS_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function resolveCorsOrigins(raw: string, isProduction: boolean): string[] {
  const configured = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .filter((origin) => origin !== '*');

  if (configured.length > 0) {
    return configured;
  }

  return isProduction ? [] : [...DEVELOPMENT_CORS_ORIGINS];
}
