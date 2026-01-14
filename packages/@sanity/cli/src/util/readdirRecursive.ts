import fs from 'node:fs/promises'
import path from 'node:path'

export interface ReaddirItem {
  isDir: boolean
  path: string
}

export async function readdirRecursive(dir: string): Promise<ReaddirItem[]> {
  let content: ReaddirItem[] = []

  const currentPath = path.resolve(dir)
  const dirContent = (await fs.readdir(currentPath)).map((item) => path.join(currentPath, item))

  for (const subPath of dirContent) {
    const stat = await fs.stat(subPath)
    const isDir = stat.isDirectory()
    content.push({isDir, path: subPath})

    if (isDir) {
      content = [...content, ...(await readdirRecursive(subPath))]
    }
  }

  return content
}
