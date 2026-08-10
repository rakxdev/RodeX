# ADR-004: API key recovery window (48 h encrypted copy)

## Status
Accepted

## Date
2026-08-09

## Context
Keys are stored as HMAC hashes only — the security baseline — which means the
console can never re-show a key. Users expect to re-read a key they just
created or rotated (founder requirement, live feedback). Recovering raw keys
forever would defeat hashing.

## Decision
On creation/rotation the raw key is additionally kept as an **AES-GCM
ciphertext** (key derived from `SESSION_SECRET`, random IV) with an expiry:
**48 hours** (`key_recoverable_until`). Inside the window, `POST
/v1/admin/apps/:id/view-key` (admin session) decrypts and returns it; the UI
shows a gold seal with COPY/HIDE. After the window the ciphertext is dead —
rotation is the only path. Old pre-`rok_` keys have no ciphertext and are
immediately hash-only.

## Alternatives Considered
- **Plaintext storage**: rejected — defeats the hash baseline.
- **KMS**: paid; overkill for a personal platform.
- **No recovery**: rejected by the operator — usability won, bounded.

## Consequences
- Raw keys exist server-side only inside a 48 h window, only encrypted.
- Rotating `SESSION_SECRET` invalidates recovery (documented in docs/env.md).
- Branded keys (`rok_` + 43 base64url) make leaked keys identifiable.
