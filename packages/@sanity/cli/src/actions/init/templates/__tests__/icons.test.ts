import {readdir, readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

import getStarted from '../getStarted.js'
import {blogSchemaFolder} from '../nextjs/schemaTypes/blog.js'
import shopify from '../shopify.js'
import shopifyOnline from '../shopifyOnline.js'

const templatesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../templates',
)

const barrelImportRe = /from\s+['"]@sanity\/icons['"]/
const debarrelledImportRe = /from\s+['"]@sanity\/icons\/[A-Za-z0-9]+['"]/

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)))
      continue
    }
    if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('init template @sanity/icons usage', () => {
  test('nextjs blog schema types use de-barrelled icon imports', () => {
    for (const [fileName, source] of Object.entries(blogSchemaFolder)) {
      expect(source, fileName).not.toMatch(barrelImportRe)
      if (source.includes('@sanity/icons')) {
        expect(source, fileName).toMatch(debarrelledImportRe)
      }
    }

    expect(blogSchemaFolder['authorType.']).toContain("from '@sanity/icons/User'")
    expect(blogSchemaFolder['blockContentType.']).toContain("from '@sanity/icons/Image'")
    expect(blogSchemaFolder['categoryType.']).toContain("from '@sanity/icons/Tag'")
    expect(blogSchemaFolder['postType.']).toContain("from '@sanity/icons/DocumentText'")
  })

  test.each([
    ['getStarted', getStarted],
    ['shopify', shopify],
    ['shopifyOnline', shopifyOnline],
  ] as const)('%s depends on @sanity/icons v5', (_name, template) => {
    expect(template.dependencies?.['@sanity/icons']).toMatch(/^\^5\./)
  })

  test('filesystem templates do not use barrelled @sanity/icons imports', async () => {
    const sourceFiles = await collectSourceFiles(templatesRoot)
    expect(sourceFiles.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of sourceFiles) {
      const source = await readFile(file, 'utf8')
      if (barrelImportRe.test(source)) {
        offenders.push(path.relative(templatesRoot, file))
      }
    }

    expect(offenders).toEqual([])
  })
})
