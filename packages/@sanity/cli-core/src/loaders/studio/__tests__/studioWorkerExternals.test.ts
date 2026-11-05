import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {type FetchResult} from 'vite/module-runner'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  getNodeModuleFormat,
  getNodeModulesPackageName,
  getStudioWorkerExternals,
  isNativeModuleLoadError,
  preferNativeExternal,
} from '../studioWorkerExternals.js'

let tempDir: string

function writeFile(path: string, content: Record<string, unknown> | string) {
  const filePath = join(tempDir, path)
  mkdirSync(dirname(filePath), {recursive: true})
  writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content))
  return filePath
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'studio-worker-externals-'))
})

afterEach(() => {
  rmSync(tempDir, {force: true, recursive: true})
})

describe('getStudioWorkerExternals', () => {
  test('externalizes sanity, its dependencies and peers, and the CLI dependencies', () => {
    writeFile('studio/package.json', {name: 'studio'})
    writeFile('studio/node_modules/sanity/package.json', {
      dependencies: {'@sanity/cli': '1.0.0', '@sanity/ui': '1.0.0', rxjs: '1.0.0'},
      devDependencies: {vitest: '1.0.0'},
      main: './lib/index.js',
      name: 'sanity',
      peerDependencies: {react: '1.0.0', 'styled-components': '1.0.0'},
    })
    writeFile('studio/node_modules/sanity/lib/index.js', 'export {}')
    writeFile('cli-core/package.json', {
      dependencies: {jsdom: '1.0.0', zod: '1.0.0'},
      name: '@sanity/cli-core',
    })
    const loaderPath = writeFile('cli-core/dist/loaders/studio/loader.worker.js', '')
    writeFile('cli/package.json', {
      dependencies: {
        '@sanity/cli-build': '1.0.0',
        '@sanity/cli-core': '1.0.0',
        '@sanity/client': '1.0.0',
        '@sanity/workbench-cli': '1.0.0',
        rxjs: '1.0.0',
      },
      name: '@sanity/cli',
      peerDependencies: {'not-included': '1.0.0'},
    })
    const taskPath = writeFile('cli/dist/actions/task.worker.js', '')

    expect(
      getStudioWorkerExternals({
        cliFilePaths: [loaderPath, taskPath],
        studioRootPath: join(tempDir, 'studio'),
      }),
    ).toEqual([
      '@sanity/client',
      '@sanity/ui',
      'jsdom',
      'react',
      'rxjs',
      'sanity',
      'styled-components',
      'zod',
    ])
  })

  test('returns undefined when sanity cannot be resolved from the studio', () => {
    writeFile('studio/package.json', {name: 'studio'})
    const taskPath = writeFile('cli/dist/task.worker.js', '')

    expect(
      getStudioWorkerExternals({
        cliFilePaths: [taskPath],
        studioRootPath: join(tempDir, 'studio'),
      }),
    ).toBeUndefined()
  })

  test('ignores missing or malformed package manifests of CLI files', () => {
    writeFile('studio/node_modules/sanity/package.json', {main: './index.js', name: 'sanity'})
    writeFile('studio/node_modules/sanity/index.js', 'export {}')
    writeFile('broken/package.json', '{not json')
    const brokenPath = writeFile('broken/task.worker.js', '')
    writeFile('array/package.json', '[]')
    const arrayPath = writeFile('array/task.worker.js', '')

    expect(
      getStudioWorkerExternals({
        cliFilePaths: [brokenPath, arrayPath, join(tempDir, 'missing', 'task.worker.js')],
        studioRootPath: join(tempDir, 'studio'),
      }),
    ).toEqual(['sanity'])
  })
})

describe('getNodeModulesPackageName', () => {
  test.each([
    ['/studio/node_modules/sanity/lib/index.js', 'sanity'],
    ['/studio/node_modules/@sanity/ui/dist/index.js', '@sanity/ui'],
    [
      '/repo/node_modules/.pnpm/@sanity+ui@3.0.0/node_modules/@sanity/ui/dist/index.js',
      '@sanity/ui',
    ],
    ['/studio/node_modules/plugin/node_modules/react/index.js', 'react'],
    [String.raw`C:\studio\node_modules\@sanity\vision\lib\index.js`, '@sanity/vision'],
    ['/studio/src/schema.ts', undefined],
    ['/studio/node_modules/', undefined],
    ['/studio/node_modules/@scope', undefined],
  ])('%s → %s', (filePath, expected) => {
    expect(getNodeModulesPackageName(filePath)).toBe(expected)
  })
})

describe('getNodeModuleFormat', () => {
  test('uses the file extension when it is explicit', () => {
    expect(getNodeModuleFormat(join(tempDir, 'file.mjs'))).toBe('module')
    expect(getNodeModuleFormat(join(tempDir, 'file.cjs'))).toBe('commonjs')
  })

  test('uses the `type` of the nearest package.json for `.js` files', () => {
    writeFile('esm/package.json', {type: 'module'})
    writeFile('cjs/package.json', {type: 'commonjs'})
    writeFile('untyped/package.json', {name: 'untyped'})

    expect(getNodeModuleFormat(join(tempDir, 'esm', 'dist', 'index.js'))).toBe('module')
    expect(getNodeModuleFormat(join(tempDir, 'cjs', 'index.js'))).toBe('commonjs')
    expect(getNodeModuleFormat(join(tempDir, 'untyped', 'index.js'))).toBe('commonjs')
  })
})

function errorWithCode(code: string) {
  return Object.assign(new Error(`Failed with ${code}`), {code})
}

describe('isNativeModuleLoadError', () => {
  test.each([
    'ERR_MODULE_NOT_FOUND',
    'ERR_UNKNOWN_FILE_EXTENSION',
    'ERR_UNSUPPORTED_DIR_IMPORT',
    'ERR_IMPORT_ATTRIBUTE_MISSING',
    'ERR_REQUIRE_ESM',
  ])('matches %s', (code) => {
    expect(isNativeModuleLoadError(errorWithCode(code))).toBe(true)
  })

  test('matches syntax errors, also from other realms', () => {
    expect(isNativeModuleLoadError(new SyntaxError("Named export 'x' not found"))).toBe(true)

    const foreignSyntaxError = new Error('Unexpected token')
    foreignSyntaxError.name = 'SyntaxError'
    expect(isNativeModuleLoadError(foreignSyntaxError)).toBe(true)
  })

  test('matches CommonJS globals referenced from ES modules', () => {
    expect(
      isNativeModuleLoadError(new ReferenceError('require is not defined in ES module scope')),
    ).toBe(true)
    expect(isNativeModuleLoadError(new ReferenceError('__dirname is not defined'))).toBe(true)
  })

  test('does not match other errors', () => {
    expect(isNativeModuleLoadError(new ReferenceError('PROJECT_ID is not defined'))).toBe(false)
    expect(isNativeModuleLoadError(new TypeError('Cannot read properties of undefined'))).toBe(
      false,
    )
    expect(isNativeModuleLoadError(errorWithCode('ERR_INVALID_ARG_TYPE'))).toBe(false)
    expect(isNativeModuleLoadError('ERR_MODULE_NOT_FOUND')).toBe(false)
    expect(isNativeModuleLoadError(undefined)).toBe(false)
  })
})

describe('preferNativeExternal', () => {
  const external = {externalize: 'file:///studio/node_modules/sanity/lib/index.js', type: 'module'}
  const inlined = {
    code: 'inlined',
    file: '/studio/node_modules/sanity/lib/index.js',
    id: '/studio/node_modules/sanity/lib/index.js',
    invalidate: false,
    url: 'sanity',
  }

  test('keeps modules that Node.js can load external', async () => {
    const importNatively = vi.fn().mockResolvedValue({})
    const inline = vi.fn()

    await expect(
      preferNativeExternal(external as FetchResult, {importNatively, inline}),
    ).resolves.toBe(external)
    expect(importNatively).toHaveBeenCalledWith(external.externalize)
    expect(inline).not.toHaveBeenCalled()
  })

  test('inlines modules that Node.js cannot load', async () => {
    const error = Object.assign(new Error('Unknown file extension ".css"'), {
      code: 'ERR_UNKNOWN_FILE_EXTENSION',
    })
    const inline = vi.fn().mockResolvedValue(inlined)
    const onInline = vi.fn()

    await expect(
      preferNativeExternal(external as FetchResult, {
        importNatively: vi.fn().mockRejectedValue(error),
        inline,
        onInline,
      }),
    ).resolves.toBe(inlined)
    expect(inline).toHaveBeenCalledWith(external.externalize)
    expect(onInline).toHaveBeenCalledWith(external.externalize, error)
  })

  test('rethrows errors that are not about loading the module', async () => {
    const error = new TypeError('Cannot read properties of undefined')
    const inline = vi.fn()

    await expect(
      preferNativeExternal(external as FetchResult, {
        importNatively: vi.fn().mockRejectedValue(error),
        inline,
      }),
    ).rejects.toBe(error)
    expect(inline).not.toHaveBeenCalled()
  })

  test.each([
    ['inlined modules', inlined],
    ['builtins', {externalize: 'node:fs', type: 'builtin'}],
    ['network imports', {externalize: 'https://example.com/module.js', type: 'network'}],
    ['cached modules', {cache: true}],
  ])('leaves %s alone', async (_name, result) => {
    const importNatively = vi.fn()

    await expect(
      preferNativeExternal(result as FetchResult, {importNatively, inline: vi.fn()}),
    ).resolves.toBe(result)
    expect(importNatively).not.toHaveBeenCalled()
  })
})
