import path from 'node:path'

import {describe, expect, test} from 'vitest'

import {countNestedFolders} from '../countNestedFolders.js'

describe('countNestedFolders', () => {
  test('counts all segments in a path with leading slash', () => {
    expect(countNestedFolders('/src/app/studio/[[...tool]]/page.tsx')).toBe(5)
  })

  test('counts segments without leading slash', () => {
    expect(countNestedFolders('src/app')).toBe(2)
  })

  test('counts single segment with trailing slash', () => {
    expect(countNestedFolders('/src/')).toBe(1)
  })

  test('counts segments in a Windows-style path', () => {
    expect(countNestedFolders('\\src\\app\\page.tsx')).toBe(3)
  })

  test('returns 0 for root path', () => {
    expect(countNestedFolders('/')).toBe(0)
  })
})

describe('embedded studio import path generation', () => {
  test('produces correct relative import when using path.dirname to strip filename', () => {
    // Simulates the logic in init.ts:1290
    const workDir = '/projects/my-app'
    const embeddedStudioRouteFilePath = '/projects/my-app/src/app/studio/[[...tool]]/page.tsx'
    const sliced = embeddedStudioRouteFilePath.slice(workDir.length)

    const importPath = `${'../'.repeat(countNestedFolders(path.dirname(sliced)))}sanity.config`

    expect(importPath).toBe('../../../../sanity.config')
  })

  test('produces correct relative import for shallow studio path', () => {
    const workDir = '/projects/my-app'
    const embeddedStudioRouteFilePath = '/projects/my-app/app/studio/[[...tool]]/page.tsx'
    const sliced = embeddedStudioRouteFilePath.slice(workDir.length)

    const importPath = `${'../'.repeat(countNestedFolders(path.dirname(sliced)))}sanity.config`

    expect(importPath).toBe('../../../sanity.config')
  })

  test('produces correct relative import for custom deep studio path', () => {
    const workDir = '/projects/my-app'
    const embeddedStudioRouteFilePath = '/projects/my-app/src/app/admin/studio/[[...tool]]/page.tsx'
    const sliced = embeddedStudioRouteFilePath.slice(workDir.length)

    const importPath = `${'../'.repeat(countNestedFolders(path.dirname(sliced)))}sanity.config`

    expect(importPath).toBe('../../../../../sanity.config')
  })
})
