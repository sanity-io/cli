export const VALID_API_STATUSES = ['granted', 'denied', 'unset'] as const
export type ValidApiConsentStatus = (typeof VALID_API_STATUSES)[number]

/**
 * @param status - The status to check
 * @returns True if the status is valid, false otherwise
 *
 * @internal
 */
export function isValidApiConsentStatus(status: string): status is ValidApiConsentStatus {
  return VALID_API_STATUSES.includes(status as ValidApiConsentStatus)
}
