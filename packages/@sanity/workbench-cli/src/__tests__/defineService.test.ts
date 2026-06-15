import {describe, expect, test} from 'vitest'

import {SERVICE_CONTRACT_VERSION, ServiceDeclarationSchema} from '../contract.js'
import {unstable_defineService} from '../defineService.js'

const run = () => {}

describe('unstable_defineService', () => {
  test('tags the callback with its type and the contract version', () => {
    const service = unstable_defineService('worker', run)
    expect(service.type).toBe('worker')
    expect(service.version).toBe(SERVICE_CONTRACT_VERSION)
    // The callback passes through by reference — the helper is pure identity.
    expect(service.run).toBe(run)
  })
})

describe('ServiceDeclarationSchema', () => {
  test('accepts a worker declaration', () => {
    const parsed = ServiceDeclarationSchema.parse({
      name: 'unread',
      src: './src/service.ts',
      type: 'worker',
    })
    expect(parsed.type).toBe('worker')
  })

  test('rejects a name with illegal characters', () => {
    expect(
      ServiceDeclarationSchema.safeParse({name: 'un read', src: './src/service.ts', type: 'worker'})
        .success,
    ).toBe(false)
  })

  test('rejects an unknown service type', () => {
    expect(
      ServiceDeclarationSchema.safeParse({name: 'unread', src: './src/service.ts', type: 'cron'})
        .success,
    ).toBe(false)
  })
})
