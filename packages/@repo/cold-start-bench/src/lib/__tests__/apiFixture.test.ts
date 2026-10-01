import {describe, expect, test, vi} from 'vitest'

import {fixtureResponse} from '../apiFixture.ts'

vi.mock('node:fs/promises', () => ({readFile: vi.fn(), writeFile: vi.fn()}))
vi.mock('node:http', () => ({createServer: vi.fn(), request: vi.fn()}))
vi.mock('node:https', () => ({createServer: vi.fn()}))
vi.mock('node:net', () => ({connect: vi.fn()}))
vi.mock('execa', () => ({execa: vi.fn()}))

const options = {dataset: 'production', project: 'bench123'}

describe('fixtureResponse', () => {
  test('serves the real user and project API shapes, with version prefixes and query tags', () => {
    expect(fixtureResponse('GET', '/v2025-08-30/users/me?tag=sanity.cli', options)).toMatchObject({
      id: 'benchmark-user',
      provider: 'google',
    })
    expect(fixtureResponse('GET', '/v2025-09-22/projects?includeMembers=false', options)).toEqual([
      expect.objectContaining({
        createdAt: '2026-01-01T00:00:00.000Z',
        displayName: 'Benchmark Studio',
        id: 'bench123',
      }),
    ])
    expect(fixtureResponse('PATCH', '/v2025-09-22/projects/bench123', options)).toMatchObject({
      id: 'bench123',
    })
    expect(fixtureResponse('GET', '/v1/datasets', options)).toEqual([
      {aclMode: 'public', name: 'production'},
    ])
  })
  test('supplies multiple provider choices for an observable prompt', () => {
    expect(fixtureResponse('GET', '/v2025-09-23/auth/providers', options)).toEqual({
      providers: [
        {name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/login/google'},
        {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/auth/login/github'},
      ],
    })
  })
  test.each([
    ['DELETE', '/v1/projects/bench123'],
    ['GET', '/v1/projects/another'],
    ['GET', '/v1/unknown'],
  ])('rejects unexpected %s %s', (method, url) => {
    expect(() => fixtureResponse(method, url, options)).toThrow('Unexpected fixture request')
  })
})
