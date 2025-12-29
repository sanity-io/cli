export const VALID_API_STATUSES = ['granted', 'denied', 'unset'] as const
export type ValidApiConsentStatus = (typeof VALID_API_STATUSES)[number]

/**
 * Check if the given status is a valid consent status
 *
 * @param status - The status to check
 * @returns True if the status is valid, false otherwise
 * @internal
 */
export function isValidApiConsentStatus(status: string): status is ValidApiConsentStatus {
  return VALID_API_STATUSES.includes(status as ValidApiConsentStatus)
}

/**
 * Check if the given response is a valid API consent response
 *
 * @param response - The response to check
 * @returns True if the response is valid, false otherwise
 * @internal
 */
export function isValidApiConsentResponse(
  response: unknown,
): response is {status: ValidApiConsentStatus} {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    typeof response.status === 'string' &&
    isValidApiConsentStatus(response.status)
  )
}
