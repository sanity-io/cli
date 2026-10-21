import {readdir} from 'node:fs/promises'
import path from 'node:path'

/** Discover function entries without importing or executing their handlers. */
export async function discoverAppFunctions(
  workDir: string,
): Promise<{name: string; src: string}[]> {
  const functions: {name: string; src: string}[] = []
  const names = new Map<string, string>()
  for (const sourceDir of ['functions', path.join('src', 'functions')]) {
    const entries = await readdir(path.join(workDir, sourceDir), {withFileTypes: true}).catch(
      (error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return []
        }
        throw error
      },
    )
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue
      const isFunctionFile =
        entry.isFile() && /\.(js|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')
      if (!entry.isDirectory() && !isFunctionFile) continue

      const name = isFunctionFile ? path.basename(entry.name, path.extname(entry.name)) : entry.name
      const src = path.join(sourceDir, entry.name)
      // Output names must also be unique on case-insensitive filesystems.
      const key = name.toLowerCase()
      const existing = names.get(key)
      if (existing) {
        throw new Error(
          `App functions "${existing}" and "${src}" have the same name "${name}". Rename one so each function has a unique name.`,
        )
      }
      names.set(key, src)
      functions.push({name, src})
    }
  }

  return functions
}
