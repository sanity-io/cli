import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, test} from 'vitest'

import {BasicDocument} from '../BasicDocument.js'

describe('BasicDocument', () => {
  test('marks the entry module script as async so it matches the bridge script', () => {
    const html = renderToStaticMarkup(<BasicDocument entryPath="/.sanity/runtime/app.js" />)
    const entryScript = html.match(/<script\b[^>]*src="\/\.sanity\/runtime\/app\.js"[^>]*>/)?.[0]

    expect(entryScript).toBeDefined()
    expect(entryScript).toContain('async')
    expect(entryScript).toContain('type="module"')
  })

  test('uses the provided title', () => {
    const html = renderToStaticMarkup(
      <BasicDocument entryPath="/.sanity/runtime/app.js" title="My App" />,
    )

    expect(html).toContain('<title>My App</title>')
  })
})
