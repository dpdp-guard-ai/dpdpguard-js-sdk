import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalizeDataTypes } from "../client.js";

// ADR-002 D5(a): request canonicalization. These vectors are shared,
// versioned source of truth (published in @dpdpguard/contract, authored in
// dpdpbot's conformance/audit-hash-vectors.json) for exactly what payload
// shape the server's audit-hash canonicalization assumes a client already
// sent. This SDK never computes the hash itself (that needs the server's
// HMAC secret, which a client must never hold) — it only needs to prove its
// own request-building logic (`canonicalizeDataTypes`) produces the same
// `dataTypes` ordering/dedup the vectors' `expectedCanonical` encode. If this
// test ever fails after a `@dpdpguard/contract` bump, the canonicalization
// rule changed upstream and `canonicalizeDataTypes` needs a matching update.
const vectorsPath = fileURLToPath(
	new URL("../../node_modules/@dpdpguard/contract/conformance/audit-hash-vectors.json", import.meta.url),
);
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
	vectors: Array<{ name: string; input: { dataTypes: string[] }; expectedCanonical: string }>;
};

describe("audit-hash golden vectors — request canonicalization (ADR-002 D5a)", () => {
	it("has at least one vector to check (catches a broken/empty contract package)", () => {
		expect(vectors.vectors.length).toBeGreaterThan(0);
	});

	for (const vector of vectors.vectors) {
		it(`dataTypes ordering matches: ${vector.name}`, () => {
			// expectedCanonical is `field|field|...|dataTypes(comma-joined)|field|field`;
			// dataTypes is always the 5th of 7 pipe-separated segments (see
			// conformance/audit-hash-spec.md's field order).
			const expectedDataTypesSegment = vector.expectedCanonical.split("|")[4];
			const expectedDataTypes = expectedDataTypesSegment ? expectedDataTypesSegment.split(",") : [];

			expect(canonicalizeDataTypes(vector.input.dataTypes)).toEqual(expectedDataTypes);
		});
	}
});
