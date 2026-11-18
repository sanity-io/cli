import {type AtRule, type Root} from 'postcss'

const PORTAL = 'data-app-portal'

function split(value: string, separators: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (depth === 0 && separators.includes(char)) {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }
  parts.push(value.slice(start))

  return parts.map((part) => part.trim()).filter(Boolean)
}

const targetsDocumentRoot = (selector: string) =>
  /^(:root|html|body)(?![\w-])/.test(split(selector, ' >+~').at(-1) ?? '')

/**
 * In the Dashboard an app renders into an element inside the Dashboard's layout, not as the page, so
 * its `:root`, `html` and `body` rules style the page behind the Dashboard and the app inherits nothing
 * from them. Each such rule also targets the element the app renders into, which stands in for the
 * app's `body`. The original selectors stay: portals the app renders into the page's `body` inherit
 * from them, which is also why portal roots, tagged with the same scope, are left out.
 */
export function scopeAppCss(css: Root, slug: string) {
  const island = `[data-app-scope=${JSON.stringify(slug)}]:not([${PORTAL}])`
  css.walkRules((rule) => {
    const parent = rule.parent
    const nested = parent?.type === 'rule'
    const keyframe = parent?.type === 'atrule' && (parent as AtRule).name.endsWith('keyframes')
    if (nested || keyframe) return

    const roots = rule.selectors.filter((selector) => targetsDocumentRoot(selector))
    if (roots.length > 0) {
      rule.selectors = [...rule.selectors, ...roots.map((root) => `${root} ${island}`)]
    }
  })
}
