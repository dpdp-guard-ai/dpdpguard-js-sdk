import { describe, expect, it, vi } from "vitest";
import { DpdpGuardApiError, DpdpGuardClient, canonicalizeDataTypes } from "./client.js";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("canonicalizeDataTypes", () => {
	it("sorts lexicographically without deduplicating", () => {
		expect(canonicalizeDataTypes(["phone", "email"])).toEqual(["email", "phone"]);
		expect(canonicalizeDataTypes(["email", "email"])).toEqual(["email", "email"]);
	});
});

describe("DpdpGuardClient", () => {
	it("getOrgBySlug resolves against the base URL", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { orgId: "org_1", name: "Acme", slug: "acme" }));
		const client = new DpdpGuardClient({ baseUrl: "https://example.convex.site", fetch: fetchMock });

		const org = await client.getOrgBySlug("acme");

		expect(org).toEqual({ orgId: "org_1", name: "Acme", slug: "acme" });
		expect(fetchMock).toHaveBeenCalledWith("https://example.convex.site/api/v1/org/acme", expect.anything());
	});

	it("trims a trailing slash on baseUrl", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { notices: [] }));
		const client = new DpdpGuardClient({ baseUrl: "https://example.convex.site/", fetch: fetchMock });

		await client.getNoticesForOrg("org_1");

		expect(fetchMock).toHaveBeenCalledWith("https://example.convex.site/api/v1/org/org_1/notices", expect.anything());
	});

	it("getBannerConfig passes domain as a query param", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { configVersion: 3 }));
		const client = new DpdpGuardClient({ baseUrl: "https://example.convex.site", fetch: fetchMock });

		await client.getBannerConfig("org_1", { domain: "acme.com" });

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.convex.site/api/v1/org/org_1/banner-config?domain=acme.com",
			expect.anything(),
		);
	});

	it("giveConsentAnonymous sorts dataTypes and sets the idempotency header", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse(201, { consentId: "c_1", purpose: "Marketing", dataTypes: ["email", "phone"], givenAt: 1700000001000 }),
		);
		const client = new DpdpGuardClient({ baseUrl: "https://example.convex.site", fetch: fetchMock });

		await client.giveConsentAnonymous(
			{
				organizationId: "org_1",
				noticeId: "notice_1",
				purpose: "Marketing",
				dataTypes: ["phone", "email"],
				anonymousId: "anon_1",
			},
			"idem-key-1",
		);

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string).dataTypes).toEqual(["email", "phone"]);
		expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-key-1");
	});

	it("throws DpdpGuardApiError with the ApiError code on a non-2xx response", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { code: "NOT_FOUND", error: "No such notice" }));
		const client = new DpdpGuardClient({ baseUrl: "https://example.convex.site", fetch: fetchMock });

		await expect(client.getNoticeById("missing")).rejects.toMatchObject(
			new DpdpGuardApiError(404, { code: "NOT_FOUND", error: "No such notice" }),
		);
	});

	it("falls back to globalThis.fetch when no override is passed", () => {
		expect(() => new DpdpGuardClient({ baseUrl: "https://example.convex.site" })).not.toThrow();
	});
});
