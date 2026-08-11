import {describe, expect, test} from 'vitest'

import {parseArguments} from '../parseArguments.js'

describe('parseArguments', () => {
  test('omits spaced file and filename values from telemetry arguments', () => {
    const result = parseArguments([
      'node',
      'sanity',
      'assets',
      'upload',
      '--file',
      '-private/path.png',
      '--filename',
      '-private.png',
      '--type',
      'image',
    ])

    expect(result.extraArguments).toEqual(['--file', '--filename', '--type'])
    expect(result.extraArguments.join(' ')).not.toContain('private')
  })

  test('omits inline file and filename values from telemetry arguments', () => {
    const result = parseArguments([
      'node',
      'sanity',
      'assets',
      'upload',
      '--file=/Users/test/private/path.png',
      '--filename=-private.png',
      '--type=image',
    ])

    expect(result.extraArguments).toEqual(['--file', '--filename', '--type=image'])
    expect(result.extraArguments.join(' ')).not.toContain('private')
  })

  test('redacts sensitive values forwarded after the argument separator', () => {
    const result = parseArguments([
      'node',
      'sanity',
      'assets',
      'upload',
      '--',
      '--file=/Users/test/private/path.png',
      '--filename',
      '-private.png',
    ])

    expect(result.extraArguments).toEqual(['--file', '--filename'])
    expect(result.extraArguments.join(' ')).not.toContain('private')
  })
})
