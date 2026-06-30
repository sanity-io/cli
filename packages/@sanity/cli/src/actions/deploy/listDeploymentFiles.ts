import {readdir, stat} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'

interface DeployFile {
  /** Path relative to the source directory, always with forward slashes */
  path: string
  size: number
}

export interface DeployFileSummary {
  count: number
  list: DeployFile[]
  totalBytes: number
}

/**
 * Lists the files that would be included in the deployment tarball,
 * with paths relative to the source directory.
 *
 * @internal
 */
export async function listDeploymentFiles(sourceDir: string): Promise<DeployFile[]> {
  const files: DeployFile[] = []
  await walk(sourceDir, sourceDir, files)
  return files.toSorted((a, b) => a.path.localeCompare(b.path))
}

async function walk(dir: string, baseDir: string, files: DeployFile[]): Promise<void> {
  const entries = await readdir(dir, {withFileTypes: true})

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(absolutePath, baseDir, files)
    } else if (entry.isFile()) {
      const {size} = await stat(absolutePath)
      files.push({path: relative(baseDir, absolutePath).split(sep).join('/'), size})
    }
  }
}
