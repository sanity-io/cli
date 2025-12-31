import {type SanityClient} from '@sanity/client'

export type MockClient = Partial<SanityClient>

/**
 * Creates a mock SanityClient that throws on unmocked method calls (fail-fast)
 *
 * @example
 * ```ts
 * const client = mockClient({
 *   getDocument: vi.fn().mockResolvedValue({_id: 'test'}),
 *   datasets: {
 *     list: vi.fn().mockResolvedValue([...])
 *   }
 * })
 * ```
 */
export function mockClient(methods: Partial<SanityClient> = {}): MockClient {
  return new Proxy(methods as Record<string, unknown>, {
    get(target, prop: string | symbol) {
      // Skip symbols
      if (typeof prop === 'symbol') {
        return
      }

      // Skip internal properties and Promise-related properties
      if (prop.startsWith('_') || prop === 'then' || prop === 'catch') {
        return target[prop]
      }

      // Return mocked method if exists
      if (prop in target) {
        return target[prop]
      }

      // Always throw on unmocked methods (fail-fast)
      throw new Error(
        `Unmocked client method called: ${prop}\n` +
          `Add it to your mock: mockClient({ ${prop}: vi.fn() })`,
      )
    },

    set(target, prop: string | symbol, value) {
      if (typeof prop !== 'symbol') {
        target[prop] = value
      }
      return true
    },
  })
}
