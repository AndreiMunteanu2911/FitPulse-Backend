import { getAllowedOrigins, getWebAppUrl } from './runtime';

describe('runtime configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.WEB_APP_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses local defaults', () => {
    expect(getAllowedOrigins()).toEqual(['http://localhost:3000']);
    expect(getWebAppUrl()).toBe('http://localhost:3000');
  });

  it('normalizes configured origins and app URL', () => {
    process.env.FRONTEND_ORIGIN = 'https://app.example.com/, https://preview.example.com';
    process.env.WEB_APP_URL = 'https://app.example.com/';

    expect(getAllowedOrigins()).toEqual([
      'https://app.example.com',
      'https://preview.example.com',
    ]);
    expect(getWebAppUrl()).toBe('https://app.example.com');
  });
});
