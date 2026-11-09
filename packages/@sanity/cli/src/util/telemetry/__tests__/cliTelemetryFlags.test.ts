import {describe, expect, test} from 'vitest'

import {sanitizeCliFlags} from '../cliTelemetryFlags.js'

describe('CLI flag redaction at intake', () => {
  test.each([
    [
      ['--token=private', '--format=json'],
      ['--token', '--format=json'],
    ],
    [
      ['--token', 'private', '--format=json'],
      ['--token', '--format=json'],
    ],
    [
      ['--token', '--format=private', '--json'],
      ['--token', '--format', '--json'],
    ],
    [
      ['-tprivate', '-HAuthorization: Bearer private'],
      ['--token', '--header'],
    ],
    [
      ['-itprivate', '-Fprivate', '-fprivate'],
      ['--include', '--token', '--field', '--raw-field'],
    ],
    [
      ['--header=private', '--header=other', '--json'],
      ['--header', '--header', '--json'],
    ],
    [
      ['--template-token=private', '--env=private'],
      ['--template-token', '--env'],
    ],
    [
      ['--file=private', '--format=ndjson'],
      ['--file', '--format=ndjson'],
    ],
    [['--params={"email":"jane@example.test"}'], ['--params']],
    [['private', '--', '--token=private'], []],
    [
      ['--unlisted=value', '-XPOST', '--json'],
      ['--method=POST', '--json'],
    ],
  ])('sanitizes %j', (input, output) => expect(sanitizeCliFlags(input)).toEqual(output))

  test('ignores malformed shapes', () => {
    expect(sanitizeCliFlags(null)).toEqual([])
    expect(sanitizeCliFlags([null, {}, 3, 'private', '--invalid flag'])).toEqual([])
  })
})
