export const VERSION = "0.1.0";

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
