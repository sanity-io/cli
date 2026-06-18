// Configuration values for the browser-side early-auth probe.
//
// These are the single source of truth for the values the decorator passes into
// the inlined probe (`earlyAuthProbeScript.ts`). The probe stays self-contained
// (zero imports) by receiving them as arguments rather than reading them here.
//
// Each value mirrors a constant in the sanity monorepo's auth store and must
// stay in sync with it (packages/sanity/src/core/store/authStore/constants.ts):
//   - EARLY_AUTH_API_VERSION         <-> AUTH_API_VERSION
//   - EARLY_AUTH_TOKEN_STORAGE_PREFIX <-> AUTH_TOKEN_STORAGE_PREFIX
//   - EARLY_AUTH_REQUEST_TAG          <-> requestTagPrefix + the probe's own suffix

/** API version segment in the probe's `/users/me` request URL. */
export const EARLY_AUTH_API_VERSION = 'v2026-05-04'

/** Prefix for the localStorage key holding a per-project auth token. */
export const EARLY_AUTH_TOKEN_STORAGE_PREFIX = '__studio_auth_token_'

/** Request tag identifying the probe in API logs and metrics. */
export const EARLY_AUTH_REQUEST_TAG = 'sanity.studio.auth.early-probe'
