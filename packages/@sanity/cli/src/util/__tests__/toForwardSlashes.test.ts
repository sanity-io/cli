import {win32} from 'node:path'

import {describe, expect, it} from 'vitest'

import {toForwardSlashes} from '../toForwardSlashes.js'

describe('Windows path normalization for ESM imports', () => {
  it('converts backslashes to forward slashes for JavaScript imports', () => {
    // Test with actual Windows path.relative() output
    const windowsPath = win32.relative(
      'C:\\project\\.sanity\\runtime',
      'C:\\project\\sanity.config.ts',
    )
    expect(windowsPath).toBe('..\\..\\sanity.config.ts') // Windows uses backslashes
    expect(toForwardSlashes(windowsPath)).toBe('../../sanity.config.ts') // Converts to forward slashes

    // Test with mixed separators and absolute paths
    expect(toForwardSlashes('C:\\Users\\test/project\\src/App.tsx')).toBe(
      'C:/Users/test/project/src/App.tsx',
    )
  })
})
