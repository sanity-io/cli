import {describe, expect, test, vi} from 'vitest'

import {mockClient} from '../mockClient.js'

describe('#mockClient', () => {
  test('returns mocked methods', async () => {
    const mockGetDocument = vi.fn().mockResolvedValue({_id: 'test-doc', title: 'Test'})

    const client = mockClient({
      getDocument: mockGetDocument,
    })

    const result = await client.getDocument?.('test-doc')

    expect(mockGetDocument).toHaveBeenCalledWith('test-doc')
    expect(result).toEqual({_id: 'test-doc', title: 'Test'})
  })

  test('throws on unmocked methods (fail-fast)', () => {
    const client = mockClient({
      getDocument: vi.fn(),
    })

    expect(() => client.fetch?.('*[_type == "post"]')).toThrow(
      'Unmocked client method called: fetch',
    )
    expect(() => client.fetch?.('*[_type == "post"]')).toThrow(
      'Add it to your mock: mockClient({ fetch: vi.fn() })',
    )
  })

  test('works with nested objects like datasets', async () => {
    const mockList = vi.fn().mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    const client = mockClient({
      datasets: {
        list: mockList,
      } as never,
    })

    const result = await client.datasets?.list?.()

    expect(mockList).toHaveBeenCalled()
    expect(result).toEqual([{name: 'production'}, {name: 'staging'}])
  })

  test('works with deeply nested objects like users.getById', async () => {
    const mockGetById = vi.fn().mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
    })

    const client = mockClient({
      users: {
        getById: mockGetById,
      } as never,
    })

    const result = await client.users?.getById?.('me')

    expect(mockGetById).toHaveBeenCalledWith('me')
    expect(result).toEqual({email: 'test@example.com', id: 'user-123'})
  })

  test('allows setting new methods dynamically', () => {
    const client = mockClient({
      getDocument: vi.fn(),
    })

    const mockFetch = vi.fn().mockResolvedValue([])
    client.fetch = mockFetch

    expect(client.fetch).toBe(mockFetch)
  })

  test('creates empty client that throws on any method call', () => {
    const client = mockClient()

    expect(() => client.getDocument?.('test')).toThrow('Unmocked client method called')
  })

  test('skips symbols and internal properties', () => {
    const client = mockClient({
      getDocument: vi.fn(),
    })

    // Should not throw for internal properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any)._internal).toBeUndefined()
  })

  test('throws with helpful error message including method name', () => {
    const client = mockClient()

    expect(() => client.projects?.list?.()).toThrow('Unmocked client method called: projects')
  })
})
