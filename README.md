# FitPulse Backend

NestJS backend for FitPulse. This repo owns all `/api/*` functionality that previously lived in the Next.js frontend.

## Stack

| Layer | Technology |
| --- | --- |
| API framework | NestJS |
| Runtime | Node.js |
| Database/auth/storage | Supabase |
| Payments | Stripe |
| AI provider | OpenRouter |
| Deployment target | Vercel |

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm start:dev
```

The local backend listens on `http://localhost:3001` by default.

## Environment

Server-only values belong here, not in the frontend:

```env
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
NEXT_PUBLIC_PRODUCTION_APP_URL=https://fitpulseam.vercel.app

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_ALLOWED_SHIPPING_COUNTRIES=US,CA,GB,AU,DE,FR,NL,BE,ES,IT,PT,RO

OPENROUTER_API_KEY=
OPENROUTER_CHAT_MODEL=
```

`SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, and OpenRouter keys must never be exposed with a `NEXT_PUBLIC_` prefix.

## API Shape

The backend preserves the existing frontend contract:

- `/api/auth/*`
- `/api/workouts/*`
- `/api/exercises/*`
- `/api/sets/*`
- `/api/templates/*`
- `/api/dashboard`
- `/api/achievements`
- `/api/user/*`
- `/api/admin/*`
- `/api/ai/*`
- `/api/social/*`
- `/api/blog/*`
- `/api/shop/*`
- `/api/form-logs/*`

The implementation lives in `src/routes`, with a Nest catch-all adapter in `src/api-router.service.ts`.

## Vercel

This repo includes Vercel function entrypoints in `api/index.ts` and `api/[...path].ts`.

Set the backend project environment variables from `.env.example`, then deploy the backend project. Point the frontend to the deployed backend with:

```env
NEXT_PUBLIC_API_URL=https://your-fitpulse-backend.vercel.app
```

Configure Stripe webhooks to call:

```text
https://your-fitpulse-backend.vercel.app/api/shop/webhook
```

## Security Boundary

The browser should only receive public Supabase values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Privileged operations use this backend. The service-role Supabase client is only created server-side after route-level authorization checks.
