// eslint-disable-next-line import-x/no-extraneous-dependencies
import {vi} from 'vitest'

/**
 * A per-file in-memory stand-in for the small slice of `node:fs` the registry
 * uses, so registry-backed tests run the real read/write path with no disk I/O
 * and assert the persisted manifest — the thing the workbench actually reads —
 * rather than the arguments handed to a mocked collaborator.
 *
 * Each caller gets its OWN `files`/`dirs` state: call once per test file (inside
 * `vi.hoisted`) and `reset()` in `beforeEach`, so state never leaks between
 * files or tests. Models just enough: absolute posix paths, the `wx`
 * exclusive-create flag the lock relies on, and ENOENT on missing reads/unlinks.
 */
export function createFsMock() {
  const files = new Map<string, string>()
  const dirs = new Set<string>()

  return {
    dirs,
    files,
    module: {
      // `path.join` yields backslash separators on Windows, so match on either.
      existsSync: (p: string) =>
        files.has(p) ||
        dirs.has(p) ||
        [...files.keys()].some((f) => f.startsWith(`${p}/`) || f.startsWith(`${p}\\`)),
      mkdirSync: (p: string) => dirs.add(p),
      // `path.join` yields backslash separators on Windows, so match on either.
      readdirSync: (p: string) =>
        [...files.keys()]
          .filter((f) => f.slice(0, Math.max(f.lastIndexOf('/'), f.lastIndexOf('\\'))) === p)
          .map((f) => f.slice(p.length + 1)),
      readFileSync: (p: string) => {
        if (!files.has(p)) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
        return files.get(p)
      },
      realpathSync: {native: (p: string) => p},
      unlinkSync: (p: string) => {
        if (!files.has(p)) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
        files.delete(p)
      },
      watch: vi.fn(),
      writeFileSync: vi.fn((p: string, data: string, opts?: {flag?: string}) => {
        if (opts?.flag?.includes('x') && files.has(p)) {
          throw Object.assign(new Error('EEXIST'), {code: 'EEXIST'})
        }
        files.set(p, data)
      }),
    },
    reset() {
      files.clear()
      dirs.clear()
    },
  }
}
