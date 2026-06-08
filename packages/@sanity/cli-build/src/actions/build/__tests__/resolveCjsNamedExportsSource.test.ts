import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

import {getCjsNamedExports} from '../getCjsNamedExports.js'
import {resolveCjsNamedExportsSource} from '../resolveCjsNamedExportsSource.js'

const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url))

describe('resolveCjsNamedExportsSource', () => {
  test('follows production CJS re-export wrappers', async () => {
    const reactDir = path.join(packageRoot, 'node_modules/react')
    const source = await resolveCjsNamedExportsSource(reactDir, path.join(reactDir, 'index.js'))

    expect(source).toContain('exports.createElement')
    expect(source).not.toMatch(/module\.exports\s*=\s*require/)
  })

  test('returns wrapper source when it declares named exports directly', async () => {
    const reactDomDir = path.join(packageRoot, 'node_modules/react-dom')
    const entryPath = path.join(reactDomDir, 'server.browser.js')
    const source = await resolveCjsNamedExportsSource(reactDomDir, entryPath)

    expect(source).toContain('exports.renderToString')
    expect(await getCjsNamedExports(source, 'react-dom/server')).toEqual(
      expect.arrayContaining(['renderToString', 'renderToStaticMarkup']),
    )
  })
})
