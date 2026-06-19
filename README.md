# FitPulse Backend

NestJS API for FitPulse. This repository owns authentication sessions, database access, authorization, business rules, AI calls, payments, storage mutations, and Supabase migrations.

The frontend repository contains the Next.js UI and Capacitor Android shell. It calls same-origin `/api/*`; Next.js rewrites those requests to this service. Keeping the browser on same-origin API URLs preserves the Supabase auth cookies and avoids exposing backend credentials.

## Stack

| Layer | Technology |
| --- | --- |
| API | NestJS 11 on Node.js |
| Database, auth, storage | Supabase |
| Validation | Zod |
| Payments | Stripe Checkout and webhooks |
| AI | OpenRouter |
| Hosting | Vercel Functions |
| Tests | Jest and Supertest |

## Repository Ownership

This repository owns:

- Every `/api/*` route and authorization check.
- Supabase server and service-role clients.
- Database migrations in `migrations/`.
- Workout completion, records, volume, streaks, achievements, and XP calculations.
- Admin operations, Stripe fulfillment, AI calls, and persisted form-session validation.
- Server-side tests for API and business logic.

The frontend may calculate transient UI state and real-time camera feedback. Browser-produced form scores are treated as user-provided analytics, not as trusted inputs for authorization, XP, achievements, payments, or other users' data.

## Local Setup

Requirements: Node.js 22+, pnpm, a Supabase project, and the separate frontend repository.

```bash
pnpm install
Copy-Item .env.example .env
pnpm start:dev
```

The API listens on `http://localhost:3001` by default. Start the frontend on `http://localhost:3000`; its `API_URL` should be `http://localhost:3001`.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | Local only | Local Nest port; Vercel supplies its own runtime port. |
| `FRONTEND_ORIGIN` | Yes | Comma-separated browser origins allowed by CORS. No paths or trailing slashes. |
| `WEB_APP_URL` | Yes | Canonical frontend URL used by Stripe success and cancel redirects. |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_ANON_KEY` | Yes | Server-side auth/session client key. RLS still applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Privileged server key. Never expose it to the frontend. |
| `STRIPE_SECRET_KEY` | Shop only | Stripe server SDK key. |
| `STRIPE_WEBHOOK_SECRET` | Shop only | Signing secret for the backend webhook endpoint. |
| `STRIPE_ALLOWED_SHIPPING_COUNTRIES` | Optional | Comma-separated Checkout shipping countries. |
| `OPENROUTER_API_KEY` | AI only | OpenRouter credential. |
| `OPENROUTER_EMBEDDING_MODEL` | Optional | Embedding model used by AI context features. |

Do not prefix backend secrets with `NEXT_PUBLIC_`. `FRONTEND_ORIGIN` defaults to `http://localhost:3000` locally; production should always set it explicitly.

Chat is fixed to `openrouter/free`; there is no application-level chat fallback chain.

## Database Setup

Run the SQL files in `migrations/` in numeric order against a new Supabase project. They create tables, constraints, functions, triggers, RLS policies, and storage policies.

The migrations include the required storage configuration for progress photos, social posts, blog images, and product images. Review every policy before using production data, and keep RLS enabled even though privileged routes can use the service-role client.

## API Areas

- `/api/auth/*`: login, signup, logout, and session lookup.
- `/api/workouts/*`, `/api/sets/*`, `/api/templates/*`: workout tracking.
- `/api/dashboard`, `/api/gamification`, `/api/achievements`: server-derived progress.
- `/api/exercises/*`, `/api/personal-records`, `/api/form-logs/*`: exercise and form data.
- `/api/user/*`, `/api/weight-logs`, `/api/progress-photos`: user profile data.
- `/api/social/*`, `/api/blog/*`: community content.
- `/api/shop/*`: products, Checkout, orders, confirmation, and webhook handling.
- `/api/ai/*`: conversations, coaching, and workout generation.
- `/api/admin/*`: role-protected administration.

The migrated route modules live under `src/routes`. `src/route-manifest.ts` maps URLs to those modules, and `src/api-router.service.ts` adapts Express requests to the preserved route contract.

## Security Model

- Authenticated routes derive the user from the server-side Supabase session cookie.
- Admin routes call `requireAdmin()` and verify `user_stats.role` server-side.
- User IDs from request bodies are never an authorization source.
- Workout completion uses the `finish_workout` database function.
- Achievement eligibility and XP claims are recomputed server-side and committed atomically.
- Stripe fulfillment is accepted only through signed webhooks or verified Checkout sessions.
- Service-role access stays in backend helpers and is used only after authorization.
- CORS accepts only `FRONTEND_ORIGIN`; credentials are enabled for supported browser clients.
- Raw request bodies are capped at 15 MB.

The supported web and Android flow is same-origin `/api/*` through the frontend rewrite. A future native client that calls this domain directly should use bearer-token authentication and requires an explicit backend auth adapter; CORS alone does not authenticate requests.

## Testing

```bash
pnpm test
pnpm test:e2e
pnpm test:cov
```

Unit specs live beside backend modules as `src/**/*.spec.ts`. HTTP integration tests live in `test/`. External Supabase, Stripe, and OpenRouter calls should be mocked in unit tests; use separate non-production projects for real integration testing.

## Deploy To Vercel

1. Import this repository as its own Vercel project.
2. Keep the project root at the repository root and framework preset as `Other`.
   The committed `vercel.json` intentionally skips `nest build`; Vercel bundles
   the TypeScript entrypoints under `api/` directly. The minimal `public/`
   directory satisfies Vercel's static output requirement.
3. Add all required backend variables from `.env.example` to Production, Preview, and Development as appropriate.
4. Deploy and note the backend URL, for example `https://fitpulse-backend.vercel.app`.
5. In the frontend Vercel project, set `API_URL` to that backend URL and deploy the frontend.
6. Set backend `FRONTEND_ORIGIN` and `WEB_APP_URL` to `https://fitpulse-am.vercel.app`, then redeploy the backend.

For previews, use non-production Supabase and Stripe resources. If a preview frontend calls the backend directly, add its exact origin to the comma-separated `FRONTEND_ORIGIN`; normal frontend rewrites do not require browser CORS access.

Configure Stripe to send events to:

```text
https://YOUR_BACKEND_DOMAIN/api/shop/webhook
```

Use the endpoint's signing secret as `STRIPE_WEBHOOK_SECRET`. The frontend Vercel project must not contain Supabase service-role, Stripe secret, webhook, or OpenRouter keys.

## GitHub Actions

The Supabase keep-alive workflow is in this repository. It requires these backend-repository GitHub secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

These secrets are unrelated to the frontend Capacitor APK workflow.
