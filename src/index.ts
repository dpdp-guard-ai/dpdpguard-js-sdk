export const VERSION = "2.0.0";

export { DpdpGuardClient, DpdpGuardApiError, canonicalizeDataTypes } from "./client.js";
export type {
	DpdpGuardClientOptions,
	OrgSummary,
	Notice,
	GetNoticesForOrgResponse,
	GetBannerConfigResponse,
	GiveConsentAnonymousRequest,
	GiveConsentAnonymousResponse,
	ApiError,
} from "./client.js";
