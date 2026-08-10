# ADR-002: Dual-channel admin sessions (cookie + bearer token)

## Status
Accepted

## Date
2026-08-09

## Context
The console (rodexdb.pages.dev) talks to the gateway (workers.dev) **cross-site**.
A `SameSite=None; Secure` cookie is the natural session carrier, but browsers
that block third-party cookies (Safari, Firefox strict, users with blocking on,
headless Chrome) silently drop it — login appeared to work, then `/me` always
said unauthenticated. This was observed live in production.

## Decision
Sessions are **HMAC-signed tokens** (12 h TTL) delivered two ways:
1. `rodex_session` HttpOnly cookie (browsers that accept cross-site cookies).
2. The same token in the login JSON response and the OAuth redirect
   (`/login?session=<token>`); the SPA stores it (localStorage) and sends
   `Authorization: Bearer <token>` on every request.

The gateway accepts, in order: `Authorization: Bearer`, `X-Rodex-Session`,
then the cookie. Logout is deterministic: an explicit-logout flag (persisted in
sessionStorage) plus `Cache-Control: no-store` HTML keep a logged-out user off
the board even after reload/back-button.

## Alternatives Considered
- **CHIPS (`Partitioned`) cookies**: breaks the OAuth top-level→cross-site
  handoff; rejected.
- **Storage Access API**: prompts the user; rejected for UX.
- **Cookie-only + accept the limitation**: would leave Safari/Firefox users
  locked out; rejected.

## Consequences
- Works in every browser, cookie policy irrelevant (verified live end-to-end).
- Token in localStorage is XSS-exposed by design (short TTL, single surface);
  CSP and short-lived tokens bound the blast radius.
