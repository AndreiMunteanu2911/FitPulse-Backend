# Testing

The backend uses Jest for unit tests and Supertest for HTTP integration tests.

## Commands

```bash
pnpm test
pnpm test:watch
pnpm test:cov
pnpm test:e2e
```

## Test Ownership

- `src/**/*.spec.ts`: backend business rules and configuration.
- `test/**/*.e2e-spec.ts`: Nest application and HTTP routing behavior.
- Supabase, Stripe, and OpenRouter are mocked for unit tests.
- Database policies, migrations, webhooks, and real provider calls require a separate non-production integration environment.

Frontend component, hook, store, camera-analysis, and API-client tests remain in the frontend repository.
