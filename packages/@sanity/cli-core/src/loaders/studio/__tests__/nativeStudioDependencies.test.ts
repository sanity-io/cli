import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createNativeStudioDependencies} from '../nativeStudioDependencies.js'

const mocks = vi.hoisted(() => ({
  packageDir: vi.fn(),
  readJson: vi.fn(),
  resolve: vi.fn(),
  tsconfig: vi.fn(),
}))
vi.mock('get-tsconfig', () => ({getTsconfig: mocks.tsconfig}))
vi.mock('import-meta-resolve', () => ({moduleResolve: mocks.resolve}))
vi.mock('../../../util/getLocalPackageVersion.js', () => ({getLocalPackageDir: mocks.packageDir}))
vi.mock('../../../util/readJsonFileSync.js', () => ({readJsonFileSync: mocks.readJson}))

const root = fileURLToPath(new URL('studio with spaces/', import.meta.url))
const fileUrl = (path: string) => pathToFileURL(join(root, path)).href
const importer = join(root, 'sanity.config.ts')
const options = {isEntry: false, kind: 'import-statement' as const, ssr: true}
const manifests = new Map<string, unknown>()

beforeEach(() => {
  mocks.tsconfig.mockReturnValue(null)
  manifests.clear()
  manifests.set(join(root, 'node_modules/sanity/package.json'), {
    dependencies: {'@scope/dep': '*', dep: '*'},
    peerDependencies: {react: '*'},
    type: 'module',
  })
  manifests.set(join(root, 'node_modules/dep/package.json'), {type: 'module'})
  mocks.packageDir.mockReturnValue(join(root, 'node_modules/sanity'))
  mocks.readJson.mockImplementation((path: string) => {
    if (!manifests.has(path)) throw new Error('Not found')
    return manifests.get(path)
  })
  mocks.resolve.mockImplementation((id: string) => new URL(fileUrl(`node_modules/${id}/index.js`)))
})

afterEach(() => vi.resetAllMocks())

describe('native Studio dependencies', () => {
  test('recognizes the Sanity file URL before any config imports it', () => {
    const native = createNativeStudioDependencies(root)
    const url = fileUrl('node_modules/sanity/index.js')
    expect(native.externalize(url)).toBe(url)
    expect(native.externalize(fileURLToPath(url))).toBe(url)
    expect(native.externalize(`/@fs/${fileURLToPath(url)}`)).toBe(url)
    expect(native.externalize(importer)).toBeUndefined()
    expect(native.externalize('sanity')).toBeUndefined()
    expect(native.externalize('node:fs')).toBeUndefined()
  })

  test('resolves each dependency version relative to its importer', () => {
    const native = createNativeStudioDependencies(root)
    const nestedImporter = fileUrl('node_modules/plugin/index.js')
    const nested = fileUrl('node_modules/plugin/node_modules/dep/index.mjs')
    mocks.resolve.mockReturnValue(new URL(nested))
    expect(native.plugin.resolveId('dep', nestedImporter, options)).toEqual({
      external: true,
      id: nested,
    })
    expect(mocks.resolve).toHaveBeenLastCalledWith('dep', new URL(nestedImporter), undefined)
    expect(native.externalize(nested)).toBe(nested)
  })

  test('uses the Studio root when there is no file importer', () => {
    const native = createNativeStudioDependencies(root)
    native.plugin.resolveId('dep', undefined, options)
    expect(mocks.resolve).toHaveBeenLastCalledWith('dep', new URL(fileUrl('noop.js')), undefined)
  })

  test('preserves CommonJS default and named exports through an ESM wrapper', () => {
    const native = createNativeStudioDependencies(root)
    const wrapper = native.plugin.resolveId('react', importer, options)
    expect(typeof wrapper).toBe('string')
    if (typeof wrapper !== 'string') throw new Error('Expected wrapper')
    const url = fileUrl('node_modules/react/index.js')
    const code = native.plugin.load(wrapper)
    expect(code).toContain(`import module from ${JSON.stringify(url)}`)
    expect(code).toContain(`export * from ${JSON.stringify(url)}`)
    expect(code).toContain('module.__esModule ? module.default : module')
    expect(native.plugin.resolveId(url, wrapper, options)).toEqual({external: true, id: url})
    expect(native.externalize(url)).toBe(url)
    expect(native.plugin.load(importer)).toBeNull()
  })

  test.each(['index.cjs', 'index'])('loads CommonJS %s through the wrapper', (filename) => {
    const native = createNativeStudioDependencies(root)
    mocks.resolve.mockReturnValue(new URL(fileUrl(`node_modules/react/${filename}`)))
    expect(native.plugin.resolveId('react', importer, options)).toMatch(
      /^\0sanity-commonjs-external:/,
    )
  })

  test('keeps extensionless ES modules native and caches package formats', () => {
    const native = createNativeStudioDependencies(root)
    const url = fileUrl('node_modules/dep/index')
    mocks.resolve.mockReturnValue(new URL(url))
    expect(native.plugin.resolveId('dep', importer, options)).toEqual({external: true, id: url})
    const reads = mocks.readJson.mock.calls.length
    native.plugin.resolveId('dep', importer, options)
    expect(mocks.readJson).toHaveBeenCalledTimes(reads)
  })

  test('uses require conditions and a filesystem path for CommonJS require calls', () => {
    const native = createNativeStudioDependencies(root)
    const url = fileUrl('node_modules/dep/index.cjs')
    mocks.resolve.mockReturnValue(new URL(url))
    expect(native.plugin.resolveId('dep', importer, {...options, kind: 'require-call'})).toEqual({
      external: true,
      id: fileURLToPath(url),
    })
    expect(mocks.resolve).toHaveBeenLastCalledWith(
      'dep',
      pathToFileURL(importer),
      new Set(['node', 'require']),
    )
  })

  test.each([
    './local',
    '../local',
    '/absolute',
    'node:fs',
    'https://example.com/a.js',
    '\0virtual',
    'plugin',
    '@scope',
    'C:/file.js',
  ])('leaves %s to Vite', (id) => {
    expect(createNativeStudioDependencies(root).plugin.resolveId(id, importer, options)).toBeNull()
  })

  test.each(['style.css', 'source.ts', 'data.json'])('leaves %s to Vite', (filename) => {
    const native = createNativeStudioDependencies(root)
    mocks.resolve.mockReturnValue(new URL(fileUrl(`node_modules/dep/${filename}`)))
    expect(native.plugin.resolveId('dep', importer, options)).toBeNull()
  })

  test('recognizes scoped subpaths', () => {
    const native = createNativeStudioDependencies(root)
    const url = fileUrl('node_modules/@scope/dep/theme.mjs')
    mocks.resolve.mockReturnValue(new URL(url))
    expect(native.plugin.resolveId('@scope/dep/theme', importer, options)).toEqual({
      external: true,
      id: url,
    })
  })

  test('leaves unresolved dependencies to Vite', () => {
    const native = createNativeStudioDependencies(root)
    mocks.resolve.mockImplementation(() => {
      throw new Error('Not found')
    })
    expect(native.plugin.resolveId('dep', importer, options)).toBeNull()
    expect(() => createNativeStudioDependencies(root)).not.toThrow()
  })

  test.each([{baseUrl: '.'}, {paths: {dep: ['./local.ts']}}])(
    'preserves TypeScript module resolution %j',
    (compilerOptions) => {
      mocks.tsconfig.mockReturnValue({config: {compilerOptions}})
      const native = createNativeStudioDependencies(root)
      expect(native.plugin.resolveId('sanity', importer, options)).toBeNull()
      expect(native.externalize(fileUrl('node_modules/sanity/index.js'))).toBeUndefined()
    },
  )

  test('leaves everything in Vite when Sanity cannot be found', () => {
    mocks.packageDir.mockImplementation(() => {
      throw new Error('Not found')
    })
    const native = createNativeStudioDependencies(root)
    expect(native.plugin.resolveId('sanity', importer, options)).toBeNull()
    expect(native.externalize(fileUrl('node_modules/sanity/index.js'))).toBeUndefined()
  })

  test('handles manifests without dependency fields and nested package files', () => {
    manifests.set(join(root, 'node_modules/sanity/package.json'), {type: 'module'})
    const native = createNativeStudioDependencies(root)
    const url = fileUrl('node_modules/sanity/lib/index.js')
    mocks.resolve.mockReturnValue(new URL(url))
    expect(native.plugin.resolveId('sanity', importer, options)).toEqual({external: true, id: url})
    expect(native.plugin.resolveId('dep', importer, options)).toBeNull()
    expect(mocks.readJson).toHaveBeenCalledWith(join(dirname(fileURLToPath(url)), 'package.json'))
  })
})
