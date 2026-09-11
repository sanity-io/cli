import {describe, expect, test} from 'vitest'

import {getAssetFilenameError, getIngestUrlError} from '../assetSourceValidation.js'

describe('#getIngestUrlError', () => {
  test.each([
    ['a plain https URL', 'https://example.com/hero.png'],
    ['a plain http URL', 'http://example.com/hero.png'],
    ['a presigned URL', 'https://example.com/hero.png?signature=secret&expires=1800000000'],
    ['a URL at the length limit', `https://example.com/${'a'.repeat(2028)}`],
  ])('accepts %s', (_label, url) => {
    expect(getIngestUrlError(url)).toBeUndefined()
  })

  test.each([
    ['file:', 'file:///srv/media/hero.png'],
    ['ftp:', 'ftp://example.com/hero.png'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
  ])('rejects the unsupported protocol %s', (label, url) => {
    const error = getIngestUrlError(url)

    expect(error).toContain('must use http or https')
    expect(error).toContain(label)
  })

  // A Windows path parses as a URL whose protocol is its drive letter, so it
  // reaches the protocol check rather than failing to parse.
  test('rejects a Windows path by its drive-letter protocol', () => {
    expect(getIngestUrlError(String.raw`C:\media\hero.png`)).toContain('must use http or https')
  })

  test.each([
    ['a username and password', 'https://user:pass@example.com/hero.png'],
    ['a username only', 'https://user@example.com/hero.png'],
  ])('rejects %s in the URL', (_label, url) => {
    const error = getIngestUrlError(url)

    expect(error).toContain('must not contain a username or password')
    expect(error).toContain('presigned URL')
  })

  test.each([
    ['a bare word', 'not a URL'],
    ['a protocol-relative URL', '//example.com/hero.png'],
    ['an empty string', ''],
  ])('rejects %s as unparseable', (_label, url) => {
    expect(getIngestUrlError(url)).toContain('is not a valid URL')
  })

  test('rejects a URL over the length limit without echoing it', () => {
    const url = `https://example.com/${'a'.repeat(2029)}`
    const error = getIngestUrlError(url)

    expect(error).toContain('2048 characters or fewer, but is 2049')
    expect(error).not.toContain('aaa')
  })
})

describe('#getAssetFilenameError', () => {
  test.each([
    ['a plain filename', 'hero.png'],
    ['a filename with spaces', 'my hero shot.png'],
    ['a filename at the length limit', `${'a'.repeat(251)}.png`],
    ['a dotfile', '.gitignore'],
  ])('accepts %s', (_label, filename) => {
    expect(getAssetFilenameError(filename)).toBeUndefined()
  })

  test('rejects an empty filename', () => {
    expect(getAssetFilenameError('')).toContain('must not be empty')
  })

  test('rejects a filename over the length limit', () => {
    expect(getAssetFilenameError('a'.repeat(256))).toContain('255 characters or fewer, but is 256')
  })

  test.each([
    ['a POSIX path', 'media/hero.png'],
    ['a parent traversal', '../hero.png'],
    ['a Windows path', String.raw`media\hero.png`],
    ['a null byte', 'hero\0.png'],
  ])('rejects %s', (_label, filename) => {
    expect(getAssetFilenameError(filename)).toContain(
      'must not contain path separators or null bytes',
    )
  })
})
