import { API_GLOBAL_PREFIX, apiPath, joinApiPath } from './api-prefix';

describe('joinApiPath', () => {
  it('puts the prefix in front of the segments', () => {
    expect(joinApiPath('api', 'auth')).toBe('/api/auth');
    expect(joinApiPath('api/v1', 'auth', 'refresh')).toBe('/api/v1/auth/refresh');
  });

  it('is the bare route when there is no prefix', () => {
    expect(joinApiPath('', 'auth')).toBe('/auth');
  });

  it('does not double the slashes of a sloppy prefix or segment', () => {
    expect(joinApiPath('/api/', '/auth/')).toBe('/api/auth');
  });
});

describe('apiPath', () => {
  it('uses the prefix the app is configured with', () => {
    expect(apiPath('auth')).toBe(joinApiPath(API_GLOBAL_PREFIX, 'auth'));
  });
});
