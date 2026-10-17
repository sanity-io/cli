import {type TelemetryEvent} from '@sanity/telemetry'
import {describe, expect, test} from 'vitest'

import {commandIdentity} from '../cliCommandIdentity.js'
import {sanitizeTelemetryEvent, telemetryError} from '../sanitizeTelemetryEvent.js'

const event = (overrides: Record<string, unknown> = {}): TelemetryEvent =>
  ({
    createdAt: '2026-10-14T00:00:00.000Z',
    name: 'CLI Command Executed',
    sessionId: 'session',
    traceId: 'trace',
    type: 'trace.start',
    version: 1,
    ...overrides,
  }) as TelemetryEvent

describe('CLI intake sanitation', () => {
  test.each([
    ['dataset', ['import', 'https://private.test/export', 'production'], ['import']],
    ['datasets', ['alias', 'link', 'private', 'production'], ['alias', 'link']],
    ['documents', ['query', 'private@example.test'], ['query']],
    ['deploy', ['private/path'], []],
    ['functions', ['deploy', 'private-function'], ['deploy']],
    ['exec', ['script.ts', '--', 'private'], []],
  ])('retains the recognized %s path, excluding positional input', (group, args, expected) => {
    expect(commandIdentity(group, args)).toEqual({
      commandArguments: expected,
      groupOrCommand: group,
    })
  })

  test('accepts colon-separated command identities and excludes unrecognized input', () => {
    expect(commandIdentity('datasets:alias:link', [])).toEqual({
      commandArguments: ['alias', 'link'],
      groupOrCommand: 'datasets',
    })
    expect(commandIdentity('private@example.test', [])).toEqual({
      commandArguments: [],
      groupOrCommand: 'unknown',
    })
    expect(commandIdentity('documents', [null, 'query'])).toEqual({
      commandArguments: [],
      groupOrCommand: 'documents',
    })
    expect(commandIdentity(null, {})).toEqual({
      commandArguments: [],
      groupOrCommand: 'unknown',
    })
  })

  test.each(['Authorization', 'access_token', 'client-secret', 'password', 'cookie'])(
    'redacts nested credential fields named %s',
    (key) => {
      const result = sanitizeTelemetryEvent(event({data: {nested: [{[key]: 'private'}]}}))
      expect(JSON.stringify(result)).not.toContain('private')
    },
  )

  test.each([
    `sk${'A'.repeat(178)}`,
    `sk${'B'.repeat(190)}`,
    'Bearer private-value',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature',
  ])('redacts known credential patterns in other CLI fields', (value) => {
    const result = sanitizeTelemetryEvent(event({data: {arbitrary: value}}))
    expect(JSON.stringify(result)).not.toContain(value)
  })

  test.each(['Studio Build Completed', 'Types Generated', 'Schema Extracted'])(
    'handles %s errors without a CLI tag or prefix',
    (name) => {
      const result = sanitizeTelemetryEvent(
        event({
          data: {
            cause: 'private',
            message: 'private',
            name: 'TypeError',
            stack: 'private',
          },
          name,
          type: 'trace.error',
        }),
      )
      expect(result).toMatchObject({
        data: {message: 'CLI operation failed', name: 'TypeError'},
        name,
      })
      expect(JSON.stringify(result)).not.toContain('private')
    },
  )

  test.each([null, 'private', {name: 'private'}])('bounds arbitrary errors: %j', (data) => {
    expect(sanitizeTelemetryEvent(event({data, type: 'trace.error'}))).toMatchObject({
      data: {message: 'CLI operation failed', name: 'Error'},
    })
  })

  test('removes legacy init secrets while retaining step and flag usage', () => {
    const result = sanitizeTelemetryEvent(
      event({
        data: {
          coupon: 'private',
          flags: {
            bare: true,
            coupon: 'private',
            env: 'private',
            git: 'private',
          },
          step: 'start',
        },
        name: 'CLI Init Step Completed',
      }),
    )
    expect(result).toMatchObject({
      data: {
        flags: {bare: true, coupon: true, env: true, git: true},
        step: 'start',
      },
    })
    expect(JSON.stringify(result)).not.toContain('private')
  })

  test('removes a legacy template URL', () => {
    const result = sanitizeTelemetryEvent(
      event({
        data: {
          selectedOption: 'https://private.test',
          step: 'selectProjectTemplate',
        },
        name: 'CLI Init Step Completed',
      }),
    )
    expect(result).toMatchObject({data: {step: 'selectProjectTemplate'}})
    expect(JSON.stringify(result)).not.toContain('private')
  })

  test('does not mutate input and remains stable on repeated sanitation', () => {
    const input = event({
      context: {
        commandArguments: ['query', 'private'],
        groupOrCommand: 'documents',
      },
    })
    const snapshot = JSON.stringify(input)
    const result = sanitizeTelemetryEvent(input)
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(sanitizeTelemetryEvent(result)).toEqual(result)
  })
})

describe('approved CLI payloads', () => {
  test('omits unknown keys, unbounded values, and unknown event names at every level', () => {
    const privateValue = 'ordinary-private-value-without-a-token-prefix'
    const result = sanitizeTelemetryEvent(
      event({
        context: {
          extraArguments: [`--future=${privateValue}`],
          groupOrCommand: 'deploy',
        },
        data: {futureField: {nested: privateValue}},
        extra: privateValue,
        name: privateValue,
        properties: {futureField: privateValue},
        sessionId: privateValue,
        traceId: privateValue,
        version: privateValue,
      }),
    )
    expect(result).toEqual({
      createdAt: '2026-10-14T00:00:00.000Z',
      data: {},
      name: 'CLI Other Event',
      redactionVersion: 1,
      source: 'cli',
      type: 'trace.start',
    })
    expect(JSON.stringify(result)).not.toContain(privateValue)
  })

  test('preserves version attribution and approved identifiers without copying user properties', () => {
    const input = event({
      properties: {
        cliVersion: '3.99.0',
        cpuArchitecture: 'arm64',
        dataset: 'private',
        machinePlatform: 'darwin',
        nested: {apiKey: 'private'},
        newProperty: 'private',
        projectId: 'pr0j1234',
        runtime: 'node',
        runtimeVersion: 'v20.14.0',
      },
      sessionId: 'session_01h3s55cezeqby0hf79brgdqj0',
      type: 'userProperties',
    })
    const result = sanitizeTelemetryEvent(input)
    expect(result).toMatchObject({
      properties: {
        cliVersion: '3.99.0',
        cpuArchitecture: 'arm64',
        machinePlatform: 'darwin',
        projectId: 'pr0j1234',
        runtime: 'node',
        runtimeVersion: 'v20.14.0',
      },
      sessionId: input.sessionId,
    })
    expect(JSON.stringify(result)).not.toContain('private')
  })

  test.each([
    ['Studio Build Completed', {outputSize: 1024}],
    [
      'Types Generated',
      {
        configMethod: 'cli',
        configOverloadClientMethods: false,
        queriesCount: 12,
        unknownTypeNodesRatio: 0.2,
      },
    ],
    [
      'Schema Extracted',
      {
        enforceRequiredFields: true,
        schemaFormat: 'groq-type-nodes',
        schemaTypesCount: 8,
      },
    ],
  ])('retains %s metrics while excluding unexpected input', (name, metrics) => {
    const result = sanitizeTelemetryEvent(
      event({
        context: {...metrics, unknownField: 'private'},
        data: {...metrics, manifestDir: 'private', unknownField: 'private'},
        name,
        version: 0,
      }),
    )
    expect(result).toMatchObject({context: metrics, data: metrics})
    expect(JSON.stringify(result)).not.toContain('private')
  })

  test('omits unknown event versions and invalid metric values', () => {
    expect(
      sanitizeTelemetryEvent(
        event({
          context: {configMethod: 'cli'},
          data: {queriesCount: 123},
          name: 'Types Generated',
          version: 99,
        }),
      ),
    ).toMatchObject({data: {}})
    expect(
      sanitizeTelemetryEvent(
        event({
          data: {
            configMethod: 'private',
            filesWithErrors: -1,
            outputSize: Infinity,
            queriesCount: 'private',
          },
          name: 'Types Generated',
          version: 0,
        }),
      ),
    ).toMatchObject({data: {}})
  })

  test('bounds core options, unknown flags and command data as well as context', () => {
    const command = {
      commandArguments: ['query', 'private'],
      coreOptions: {debug: 'private', help: true, token: 'private'},
      extraArguments: ['--format=private', '--new-flag=private', '--format=json'],
      groupOrCommand: 'documents',
      unknown: 'private',
    }
    const result = sanitizeTelemetryEvent(event({context: command, data: command}))
    expect(result).toMatchObject({
      data: {
        commandArguments: ['query'],
        coreOptions: {help: true},
        extraArguments: ['--format', '--format=json'],
        groupOrCommand: 'documents',
      },
    })
    expect(JSON.stringify(result)).not.toContain('private')
  })

  test('filters arrays of editor and agent names and ignores unknown init steps', () => {
    const result = sanitizeTelemetryEvent(
      event({
        data: {
          configuredEditors: ['Cursor', 'private', {token: 'private'}],
          detectedEditors: 'private',
        },
        name: 'CLI MCP Configure Completed',
        version: 1,
      }),
    )
    expect(result).toMatchObject({data: {configuredEditors: ['Cursor']}})
    expect(JSON.stringify(result)).not.toContain('private')
    expect(
      sanitizeTelemetryEvent(
        event({
          data: {flags: {token: 'private'}, step: 'private'},
          name: 'CLI Init Step Completed',
        }),
      ),
    ).toMatchObject({data: {}})
  })
})

test('retains bounded error classes for Error instances and arbitrary rejections', () => {
  expect(telemetryError(new TypeError('private'))).toEqual({
    message: 'CLI operation failed',
    name: 'TypeError',
  })
  for (const input of [null, 'private', {}, {name: 'private'}]) {
    expect(telemetryError(input)).toEqual({message: 'CLI operation failed', name: 'Error'})
  }
})
