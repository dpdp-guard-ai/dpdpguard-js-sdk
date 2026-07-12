import type {
	OrgSummary,
	Notice,
	GetNoticesForOrgResponse,
	GetBannerConfigResponse,
	GiveConsentAnonymousRequest,
	GiveConsentAnonymousResponse,
	ApiError,
} from "./generated/schema.js";

export type { OrgSummary, Notice, GetNoticesForOrgResponse, GetBannerConfigResponse, GiveConsentAnonymousRequest, GiveConsentAnonymousResponse, ApiError };

export interface DpdpGuardClientOptions {
	/** e.g. `https://your-deployment.convex.site` (see openapi/v1.yaml `servers`). */
	baseUrl: string;
	/** Override for `fetch` — useful in test environments or non-browser runtimes. */
	fetch?: typeof fetch;
}

/** Thrown for any non-2xx `/api/v1` response. `code`/`error` mirror the ApiError
 * shape from ADR-002 D2 — switch on `code`, not the free-text `error` message,
 * since only `code` is contractually stable across minor versions. */
export class DpdpGuardApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, body: ApiError) {
		super(body.error);
		this.name = "DpdpGuardApiError";
		this.status = status;
		this.code = body.code;
	}
}

/** ADR-002 D5(a): request canonicalization. `dataTypes` must be sent sorted
 * lexicographically — client ordering must not change the resulting
 * audit-hash of an otherwise-identical event (conformance/audit-hash-spec.md).
 * Deliberately does NOT deduplicate: the server's canonicalization
 * (`convex/lib/auditHash.ts`) only sorts, so deduping here would produce a
 * request whose implied canonical form the server never actually computes.
 * Exported so the conformance test can exercise it directly. */
export function canonicalizeDataTypes(dataTypes: readonly string[]): string[] {
	return [...dataTypes].sort();
}

/** A pure HTTP client over the DPDP Guard `/api/v1` public (unauthenticated)
 * surface — org/notice/banner-config reads and anonymous consent. For the
 * brokered-token and service-API-key surfaces (DSR, grievances, nomination,
 * token broker), see `@dpdpguard/server`. */
export class DpdpGuardClient {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: DpdpGuardClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "");
		this.fetchImpl = options.fetch ?? globalThis.fetch;
		if (!this.fetchImpl) {
			throw new Error("DpdpGuardClient: no fetch implementation available; pass one via `options.fetch`.");
		}
	}

	private async request<T>(path: string, init?: RequestInit): Promise<T> {
		const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				...(init?.body ? { "Content-Type": "application/json" } : {}),
				...init?.headers,
			},
		});

		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as ApiError | null;
			throw new DpdpGuardApiError(response.status, body ?? { code: "UNKNOWN", error: response.statusText });
		}

		return response.json() as Promise<T>;
	}

	/** `GET /api/v1/org/{slug}` */
	getOrgBySlug(slug: string): Promise<OrgSummary> {
		return this.request<OrgSummary>(`/api/v1/org/${encodeURIComponent(slug)}`);
	}

	/** `GET /api/v1/org/{orgId}/notices` */
	getNoticesForOrg(orgId: string): Promise<GetNoticesForOrgResponse> {
		return this.request<GetNoticesForOrgResponse>(`/api/v1/org/${encodeURIComponent(orgId)}/notices`);
	}

	/** `GET /api/v1/notices/{noticeId}` */
	getNoticeById(noticeId: string): Promise<Notice> {
		return this.request<Notice>(`/api/v1/notices/${encodeURIComponent(noticeId)}`);
	}

	/** `GET /api/v1/org/{orgId}/banner-config` — pass exactly one of `domain`/`appId`, or neither for org-default (ADR-006 D2). */
	getBannerConfig(orgId: string, scope?: { domain?: string } | { appId?: string }): Promise<GetBannerConfigResponse> {
		const query = new URLSearchParams();
		if (scope && "domain" in scope && scope.domain) query.set("domain", scope.domain);
		if (scope && "appId" in scope && scope.appId) query.set("appId", scope.appId);
		const qs = query.size > 0 ? `?${query.toString()}` : "";
		return this.request<GetBannerConfigResponse>(`/api/v1/org/${encodeURIComponent(orgId)}/banner-config${qs}`);
	}

	/** `POST /api/v1/consents/anonymous` — `dataTypes` is canonicalized (sorted, deduplicated)
	 * before sending, matching the server's audit-hash canonicalization (ADR-002 D5). Pass
	 * `idempotencyKey` to safely retry after a network timeout without double-writing. */
	giveConsentAnonymous(input: GiveConsentAnonymousRequest, idempotencyKey?: string): Promise<GiveConsentAnonymousResponse> {
		const body: GiveConsentAnonymousRequest = {
			...input,
			dataTypes: canonicalizeDataTypes(input.dataTypes),
		};
		return this.request<GiveConsentAnonymousResponse>("/api/v1/consents/anonymous", {
			method: "POST",
			body: JSON.stringify(body),
			...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
		});
	}
}
