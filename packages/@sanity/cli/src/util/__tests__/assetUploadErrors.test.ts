import {describe, expect, test} from 'vitest'

import {type AssetUploadTarget, getAssetUploadErrorMessage} from '../assetUploadErrors.js'

/**
 * Build the error shape `isHttpError` recognizes: it requires `statusCode` and
 * `message` on the error, plus `body`, `url`, `method`, `headers` and
 * `statusCode` on the response.
 */
function httpError(
  statusCode: number,
  options: {body?: unknown; message?: string; statusMessage?: string} = {},
) {
  return Object.assign(new Error(options.message ?? `HTTP ${statusCode}`), {
    response: {
      body: options.body ?? {},
      headers: {},
      method: 'POST',
      statusCode,
      statusMessage: options.statusMessage ?? 'Error',
      url: 'https://api.sanity.io/v2025-02-19/media-libraries/lib-1/from-url',
    },
    statusCode,
  })
}

describe('#getAssetUploadErrorMessage', () => {
  test('reports a non-HTTP failure without guidance', () => {
    expect(
      getAssetUploadErrorMessage(new Error('socket hang up'), {
        fromUrl: false,
        target: 'dataset',
      }),
    ).toBe('Asset upload failed: socket hang up')
  })

  test('suggests logging in on 401', () => {
    const message = getAssetUploadErrorMessage(httpError(401), {
      fromUrl: false,
      target: 'dataset',
    })
    expect(message).toContain('HTTP 401')
    expect(message).toContain('Run `sanity login` to authenticate')
  })

  test.each([
    ['dataset', 'this dataset'],
    ['media-library', 'this media library'],
  ] as [AssetUploadTarget, string][])(
    'names the %s resource in the 403 guidance',
    (target, expected) => {
      const message = getAssetUploadErrorMessage(httpError(403), {fromUrl: false, target})
      expect(message).toContain(`write access to ${expected}`)
    },
  )

  test.each([400, 413, 422])('links dataset limits on %i', (statusCode) => {
    const message = getAssetUploadErrorMessage(httpError(statusCode), {
      fromUrl: false,
      target: 'dataset',
    })
    expect(message).toContain('sanity.io/docs/content-lake/technical-limits')
  })

  test.each([400, 413, 422])('links media library docs on %i', (statusCode) => {
    const message = getAssetUploadErrorMessage(httpError(statusCode), {
      fromUrl: false,
      target: 'media-library',
    })
    expect(message).toContain('sanity.io/docs/media-library')
  })

  test.each([502, 504])(
    'explains an unreachable source on %i when fetching a URL',
    (statusCode) => {
      const message = getAssetUploadErrorMessage(httpError(statusCode), {
        fromUrl: true,
        target: 'media-library',
      })
      expect(message).toContain('Sanity could not fetch the source URL')
    },
  )

  test.each([502, 504])('omits the source URL guidance on %i for a direct upload', (statusCode) => {
    const message = getAssetUploadErrorMessage(httpError(statusCode), {
      fromUrl: false,
      target: 'media-library',
    })
    expect(message).not.toContain('Sanity could not fetch the source URL')
    expect(message).toContain('Try again.')
  })

  test('surfaces the API error string and details from the response body', () => {
    const message = getAssetUploadErrorMessage(
      httpError(400, {body: {details: 'Unsupported format', error: 'badRequest'}}),
      {fromUrl: true, target: 'media-library'},
    )
    expect(message).toContain('badRequest')
    expect(message).toContain('Details:\nUnsupported format')
  })

  test('skips the login hint when a 401 is a missing project membership', () => {
    const message = getAssetUploadErrorMessage(
      httpError(401, {body: {error: {type: 'projectUserNotFoundError'}}}),
      {fromUrl: false, target: 'media-library'},
    )
    expect(message).not.toContain('Run `sanity login`')
    expect(message).toContain('Try again.')
  })
})
