import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, test} from 'vitest'

import {DefaultDocument} from '../DefaultDocument.js'

describe('DefaultDocument', () => {
  test('marks the entry module script as async so it matches the bridge script', () => {
    const html = renderToStaticMarkup(<DefaultDocument entryPath="/.sanity/runtime/app.js" />)
    const entryScript = html.match(/<script\b[^>]*src="\/\.sanity\/runtime\/app\.js"[^>]*>/)?.[0]

    expect(entryScript).toBeDefined()
    expect(entryScript).toContain('async')
    expect(entryScript).toContain('type="module"')
  })

  test('renders stylesheet links for provided css paths', () => {
    const html = renderToStaticMarkup(
      <DefaultDocument css={['/styles.css']} entryPath="/.sanity/runtime/app.js" />,
    )

    expect(html).toContain('<link href="/styles.css" rel="stylesheet"/>')
  })
})
