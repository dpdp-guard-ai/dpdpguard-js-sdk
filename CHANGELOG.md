# Changelog

All notable changes to `@dpdpguard/js` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-29

### Changed

- **BREAKING (forced major bump, no functional SDK change):** bumped the
  `@dpdpguard/contract` dependency from `^0.2.0` to `^1.0.1`. The contract's
  own `1.0.0` was classified `BREAKING` in its CHANGELOG (tightens
  request-body field-length validation on several request schemas and adds
  an optional `Idempotency-Key` header to `POST /api/v1/grievances`, which
  this SDK does not call). Per ADR-002 D3/D4, a contract change classified
  "major" forces at least a major bump in every dependent SDK regardless of
  whether that SDK's own code needs to change — this release is that forced
  bump, not a reflection of a breaking change in this package's own API.
  `DpdpGuardClient`, `DpdpGuardApiError`, and `canonicalizeDataTypes` in
  `src/client.ts` are unchanged.
- Ran `npm run generate` against contract `1.0.1`'s `openapi/v1.yaml`
  (whose own doc-version moved 2.0.0 → 2.1.1 to document two
  already-implemented endpoints, `GET /api/v1/widget/config` and
  `POST /api/v1/cm/signal`, neither of which this SDK implements). The
  regenerated `src/generated/schema.ts` is **not** a no-op:
  - `ApiError`'s doc comment lost its `convex/lib/apiErrors.ts` cross-reference
    (cosmetic; upstream doc-comment wording change, no shape change).
  - Two new generically-emitted schema interfaces appeared,
    `WidgetConfig` and `CmSignalRecord`, sourced from the new
    `components.schemas` entries backing the two new endpoints above. These
    are additive-only exports; nothing in `src/client.ts` references them,
    and no new client methods were added for those endpoints (see "Not
    included" below).
  - All four existing operation-specific types this SDK actually uses
    (`GetNoticesForOrgResponse`, `GetBannerConfigResponse`,
    `GiveConsentAnonymousRequest`, `GiveConsentAnonymousResponse`) and every
    other existing generated type are byte-identical to the prior output.
  - `conformance/audit-hash-vectors.json` and `conformance/error-catalog.json`
    are byte-identical to the prior contract version — no DPO sign-off
    needed, and the audit-hash conformance test required no vector/content
    changes.

### Not included

- `GET /api/v1/widget/config` (public, unauthenticated — `security: []` in
  the spec) is a plausible fit for this repo's scope (public config reads,
  same shape as `getBannerConfig`) but was left out of this release: adding
  it means a new client method plus a design call on how to expose the
  nested `WidgetConfig.notice` shape, which is more than a forced
  version-bump release should carry. Left for a follow-up PR.
- `POST /api/v1/cm/signal` requires an org-scoped API key
  (`security: [apiKey: []]`) and is a third-party Consent-Manager-to-server
  inbound webhook, not part of the public/unauthenticated surface this SDK
  is scoped to. Out of scope for `@dpdpguard/js`.

### Verification

- `npm run typecheck` — pass.
- `npm test` (unit + audit-hash conformance) — pass, 12/12.
- `npm run build` — pass.

## [1.0.1] - 2026-07-26 _(backfilled)_

### Fixed

- Added the `repository` field to `package.json`, required for npm
  provenance on publish.

## [1.0.0] - 2026-07-26 _(backfilled)_

### Added

- Initial `@dpdpguard/js` release: `DpdpGuardClient`, a pure HTTP client over
  the `/api/v1` public, unauthenticated surface (org lookup, notices, banner
  config, anonymous consent), generated against `@dpdpguard/contract`.
- `src/generated/schema.ts`, produced by the hand-rolled
  `scripts/generate-schema.mjs` generator (used instead of
  openapi-typescript, which is incompatible with this repo's pinned
  `typescript@^7.0.2`).
- Audit-hash golden-vector conformance test
  (`src/__conformance__/audit-hash-vectors.conformance.test.ts`) validating
  `canonicalizeDataTypes` against `@dpdpguard/contract`'s published vectors.

> Backfill note: 1.0.0 and 1.0.1 predate this changelog and are reconstructed
> from `git log` (`6ab116b`, `83a46fb`, `214edce`) rather than from
> contemporaneous release notes.
