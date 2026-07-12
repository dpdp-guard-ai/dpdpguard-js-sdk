# dpdpguard-js-sdk

DPDP Guard JS core - pure HTTP client over the Consent API for web/RN-unsupported/lite integrations

Package: `@dpdpguard/js`

Part of the DPDP Guard SDK family. See the design spec:
https://github.com/chintans/dpdpbot/blob/main/docs/specs/mobile-server-sdk.md

## Status

Early scaffold. Covers the `/api/v1` **public, unauthenticated** surface only
(org lookup, notices, banner config, anonymous consent) — the brokered-token
and service-API-key surfaces (DSR, grievances, nomination, token broker) live
in `@dpdpguard/server`.

## Usage

```ts
import { DpdpGuardClient } from "@dpdpguard/js";

const client = new DpdpGuardClient({ baseUrl: "https://your-deployment.convex.site" });

const org = await client.getOrgBySlug("acme");
const { notices } = await client.getNoticesForOrg(org.orgId);
const bannerConfig = await client.getBannerConfig(org.orgId, { domain: "acme.com" });

await client.giveConsentAnonymous({
  organizationId: org.orgId,
  noticeId: notices[0]._id,
  purpose: "Marketing",
  dataTypes: ["email"],
  anonymousId: crypto.randomUUID(),
});
```

Non-2xx responses throw `DpdpGuardApiError` — branch on `.code` (the ADR-002
D2 stable error catalog), not the free-text `.error` message.

## Architecture: generated vs. hand-written

Per spec §11, this SDK splits into two layers — only the first is ever
regenerated:

- **`src/generated/schema.ts`** — TypeScript types generated from
  `@dpdpguard/contract`'s `openapi/v1.yaml`. Regenerate with `npm run
  generate` whenever the installed `@dpdpguard/contract` version bumps.
  Do not hand-edit.
- **`src/client.ts`** — the hand-written HTTP client built on those types.

### Why a custom generator instead of openapi-typescript

`scripts/generate-schema.mjs` is a small, dependency-light generator instead
of a stock OpenAPI-to-TS tool: openapi-typescript 7.x builds its output via
the `typescript` compiler API (`ts.factory`), and this repo's pinned
`typescript@^7.0.2` (the newer native/Corsa line) doesn't expose that API in
the same shape yet, so the two currently crash together. The custom
generator only needs a YAML parser (`yaml`) and string templating. Revisit
this once openapi-typescript ships TS7 support.

It emits every schema under `components.schemas` generically, plus named
request/response types for the specific operations this SDK implements (see
the `OPERATIONS` list in the script) — those particular shapes are inline in
the spec's path definitions rather than `components.schemas`. Adding a new
endpoint to this SDK means adding an entry there, not hand-writing a type.

### Tolerant reader (ADR-002 D4 enabling rule)

Generated response enums are widened to `"a" | "b" | (string & {})` rather
than a closed union, so a new enum value added upstream (a minor,
non-breaking contract change per ADR-002 D4) doesn't require a client type
change or runtime failure.

## Conformance gate (ADR-002 D5)

`src/__conformance__/audit-hash-vectors.conformance.test.ts` runs against the
golden vectors published in `@dpdpguard/contract`'s
`conformance/audit-hash-vectors.json`, checking that `canonicalizeDataTypes`
(used before every `giveConsentAnonymous` call) sorts `dataTypes` the same
way the server's audit-hash canonicalization does. This SDK never computes
the hash itself — that requires the server's HMAC secret, which a client
must never hold — only the client-side half of the canonicalization is
checked here. This is a required, non-optional CI gate: a failing conformance
test blocks release (see `.github/workflows/ci.yml`).

## Scripts

| Script | What it does |
|---|---|
| `npm run generate` | Regenerate `src/generated/schema.ts` from the installed `@dpdpguard/contract`. |
| `npm run typecheck` | Full project typecheck, including tests. |
| `npm test` | Unit + conformance tests (vitest). |
| `npm run build` | Regenerate, then compile `src/` (excluding tests) to `dist/`. |

## Publishing

`.github/workflows/publish.yml` publishes to npm via OIDC trusted publishing
(no `NPM_TOKEN` secret), triggered by pushing a `v*` tag or manually via
`workflow_dispatch`. **One-time setup required before this can succeed:**
register `@dpdpguard/js` on npmjs.com with GitHub Actions as a Trusted
Publisher (Organization/repo/workflow filename = this repo /
`publish.yml`) — same one-time step already done for
`dpdpbot`'s `@dpdpguard/contract`.
