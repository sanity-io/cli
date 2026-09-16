import {describe, expect, test} from 'vitest'

import {sanitizeIcon} from '../sanitizeIcon.js'

describe('sanitizeIcon', () => {
  test('keeps allowlisted SVG markup', () => {
    expect(sanitizeIcon('  <svg><path d="M0 0" /></svg>  ')).toBe(
      '<svg><path d="M0 0"></path></svg>',
    )
  })

  test('removes scripts, event handlers, and unsafe URLs', () => {
    const html = [
      '<svg onload="alert(1)">',
      '<script>alert(1)</script>',
      '<a href="javascript:alert(1)"><path d="M0 0" /></a>',
      '</svg>',
    ].join('')

    expect(sanitizeIcon(html)).toBe('<svg><a><path d="M0 0"></path></a></svg>')
  })
})
