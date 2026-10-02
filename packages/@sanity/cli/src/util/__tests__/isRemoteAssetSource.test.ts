import {describe, expect, test} from 'vitest'

import {isRemoteAssetSource} from '../isRemoteAssetSource.js'

describe('#isRemoteAssetSource', () => {
  // `http:` is remote but not ingestable: the protocol is rejected by
  // `getIngestUrlError` instead, so the user gets a URL error rather than a
  // missing-directory one.
  test.each(['https://example.com/hero.png', 'http://example.com/hero.png'])(
    'treats %s as remote',
    (source) => {
      expect(isRemoteAssetSource(source)).toBe(true)
    },
  )

  test.each([
    ['a relative directory', './products'],
    ['a bare directory name', 'products'],
    ['an archive name', 'gallery.tar.gz'],
    ['an absolute POSIX path', '/srv/media/hero.png'],
    ['a directory named like a host', 'example.com'],
    ['an empty string', ''],
  ])('treats %s as a local path', (_label, source) => {
    expect(isRemoteAssetSource(source)).toBe(false)
  })

  // These parse as URLs whose protocol is the drive letter, so a parseability
  // check alone would route a local import to the network.
  test.each([
    ['a backslash Windows path', String.raw`C:\media\hero.png`],
    ['a forward-slash Windows path', 'd:/media'],
  ])('treats %s as a local path', (_label, source) => {
    expect(isRemoteAssetSource(source)).toBe(false)
  })

  test.each([
    ['file:', 'file:///srv/media/hero.png'],
    ['ftp:', 'ftp://example.com/hero.png'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
  ])('rejects the unsupported protocol %s', (_label, source) => {
    expect(isRemoteAssetSource(source)).toBe(false)
  })
})
