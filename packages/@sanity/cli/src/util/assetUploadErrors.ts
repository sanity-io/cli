import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

const DATASET_ASSET_LIMITS_URL =
  'https://www.sanity.io/docs/content-lake/technical-limits#k2c53dc30e24b'
const MEDIA_LIBRARY_ASSET_LIMITS_URL = 'https://www.sanity.io/docs/media-library'

/**
 * The asset store an upload targeted. Only affects guidance wording: which
 * resource the user needs write access to, and which limits to check.
 */
export type AssetUploadTarget = 'dataset' | 'media-library'

const TARGET_GUIDANCE: Record<AssetUploadTarget, {limitsUrl: string; writeAccessTo: string}> = {
  dataset: {limitsUrl: DATASET_ASSET_LIMITS_URL, writeAccessTo: 'this dataset'},
  'media-library': {limitsUrl: MEDIA_LIBRARY_ASSET_LIMITS_URL, writeAccessTo: 'this media library'},
}

function isProjectUserNotFoundError(body: Record<string, unknown>): boolean {
  const responseError = body.error
  return (
    typeof responseError === 'object' &&
    responseError !== null &&
    'type' in responseError &&
    responseError.type === 'projectUserNotFoundError'
  )
}

/**
 * Turn an asset upload failure into a message that says what the API reported
 * and what to do about it.
 *
 * @param error - The thrown error, HTTP or otherwise.
 * @param options - `fromUrl` selects the gateway-failure guidance, which only
 *   makes sense when Content Lake was fetching the source itself; `target`
 *   selects the resource-specific wording.
 *
 * @internal
 */
export function getAssetUploadErrorMessage(
  error: unknown,
  options: {fromUrl: boolean; target: AssetUploadTarget},
): string {
  if (!isHttpError(error)) {
    return `Asset upload failed: ${getErrorMessage(error)}`
  }

  const {limitsUrl, writeAccessTo} = TARGET_GUIDANCE[options.target]

  const body =
    typeof error.response.body === 'object' &&
    error.response.body !== null &&
    !Array.isArray(error.response.body)
      ? (error.response.body as Record<string, unknown>)
      : {}

  const responseError =
    typeof body.error === 'string' ? body.error : error.response.statusMessage || 'HTTP error'

  const statusCode =
    typeof body.statusCode === 'number' || typeof body.statusCode === 'string'
      ? body.statusCode
      : error.statusCode

  const projectUserNotFound = isProjectUserNotFoundError(body)
  const responseMessage = projectUserNotFound ? error.message : getErrorMessage(error)
  const message = /[.!?]$/.test(responseMessage) ? responseMessage : `${responseMessage}.`
  const details = typeof body.details === 'string' ? `\n\nDetails:\n${body.details}` : ''
  const response = `Asset upload failed: HTTP ${statusCode} - ${responseError}\n${message}${details}`

  if (error.statusCode === 401 && !projectUserNotFound) {
    return `${response}\n\nRun \`sanity login\` to authenticate, then try again.`
  }
  if (error.statusCode === 403) {
    return `${response}\n\nCheck that your account has write access to ${writeAccessTo}, then try again.`
  }
  if ([400, 413, 422].includes(error.statusCode)) {
    return `${response}\n\nCheck the asset requirements and current technical limits, then try again: ${limitsUrl}`
  }
  if (options.fromUrl && [502, 504].includes(error.statusCode)) {
    return `${response}\n\nSanity could not fetch the source URL. Check that it is reachable from the public internet without authentication and serves the asset directly, then try again.`
  }
  return `${response}\n\nTry again.`
}
