import {describe, expect, test} from 'vitest'

import {isIngestableUrl} from '../isIngestableUrl.js'

describe('#isIngestableUrl', () => {
  test.each(['https://example.com/hero.png', 'http://example.com/hero.png'])(
    'treats %s as a URL',
    (source) => {
      expect(isIngestableUrl(source)).toBe(true)
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
    expect(isIngestableUrl(source)).toBe(false)
  })

  // These parse as URLs whose protocol is the drive letter, so a parseability
  // check alone would route a local import to the network.
  test.each([
    ['a backslash Windows path', String.raw`C:\media\hero.png`],
    ['a forward-slash Windows path', 'd:/media'],
  ])('treats %s as a local path', (_label, source) => {
    expect(isIngestableUrl(source)).toBe(false)
  })

  test.each([
    ['file:', 'file:///srv/media/hero.png'],
    ['ftp:', 'ftp://example.com/hero.png'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
  ])('rejects the unsupported protocol %s', (_label, source) => {
    expect(isIngestableUrl(source)).toBe(false)
  })
})
