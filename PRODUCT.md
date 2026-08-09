# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Frontend (user-confirmed): React + Vite + Tailwind CSS v4 + shadcn/ui (Radix) + Framer Motion, deployed to Cloudflare Pages at `rodexdb.pages.dev`. Backend: live Cloudflare Worker gateway (`rodex-gateway.rakxdev.workers.dev`) + DynamoDB (ap-southeast-1) — contract in `docs/openapi.yaml` / `docs/api.md`.

## Users

Rakesh — solo developer. A personal tool, but built to full production grade so it can serve as a reusable platform later. Primary job: manage per-app database credentials, tables, and data through a dashboard instead of raw DynamoDB/CLI work.

## Product Purpose

Admin dashboard for the RodeX database gateway: create and manage apps, issue and rotate API keys, manage tables, query data, consult the API documentation, and monitor usage. Everything the gateway API can do, surfaced cleanly.

## Positioning

A personal, self-hosted "database platform" control plane: one dashboard, per-app isolated credentials, one documented API, no third-party database company. The dashboard's job is to make the full platform capability visible and operable — not a thin CRUD skin.

## Operating Context

Rakesh uses it in a browser on desktop and mobile. Deployed on Cloudflare Pages; gateway worker is the API origin; login is GitHub OAuth + password (backend-provided). His bots and websites consume the gateway API and their keys are managed here.

## Capabilities and Constraints

- Confirmed screens: **Apps list** (create, overview, delete), **App detail** (one-time key display, curl examples, tables, quick query), **Docs** (API reference), **Usage/limits awareness**.
- Full production readiness: loading / empty / error states, responsive layout, accessible baseline, theming, safe handling of one-time secrets.
- Constraint: free-tier Cloudflare hosting; Pages build/bandwidth limits respected.
- The current placeholder `dashboard/` (vanilla HTML) is to be **deleted** — clean project, new app replaces it.
- Undecided: which additional surfaces (e.g., from Cloudflare/AWS platform capabilities) beyond the confirmed four — user wants "everything" the platform can offer; scope is resolved during direction/build planning.

## Brand Commitments

- Name: **RodeX** (displayed as **RodeX DB**).
- No existing brand assets. A new **SVG logo** is to be designed as part of this build (user-approved creation), following researched logo best practices.
- Voice: developer tool — precise, calm, trustworthy.

## Evidence on Hand

- Live API contract: `docs/openapi.yaml`, `docs/api.md`, `docs/rate-limits.md`; live endpoints verified; 77+ tests.
- No marketing content, testimonials, or customer proof — nothing to fabricate.

## Product Principles

1. **Production-grade over prototype** — every state, error, and edge case handled; nothing ships half-done.
2. **Surface the full platform** — nothing the API can do should be unreachable from the UI.
3. **One documented contract** — dashboard and docs speak the same API language, exactly.
4. **The data is the hero** — Operate-mode clarity; fast scanning, calm density.
5. **Free-tier honest** — limits are respected and displayed, never hidden.

## Accessibility & Inclusion

No product-specific requirement confirmed beyond a production-grade baseline: keyboard operable, sufficient contrast, labeled controls.
