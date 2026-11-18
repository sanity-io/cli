import postcss, {type AtRule, type ChildNode, type Root, type Rule} from 'postcss'

const PORTAL = 'data-app-portal'
const INHERITED =
  /^(--|color$|font|line-height|letter-spacing|word-spacing|text-|white-space|direction|visibility|cursor|quotes|list-style|color-scheme|-webkit-font-smoothing|caret-color|accent-color|tab-size|hyphens)/
const PAGE_WIDE_AT_RULE =
  /^(charset|import|namespace|keyframes|-webkit-keyframes|font-face|property|counter-style|font-feature-values|font-palette-values)$/
const ANIMATION_KEYWORDS =
  /^(none|infinite|normal|reverse|alternate|alternate-reverse|forwards|backwards|both|running|paused|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|auto|initial|inherit|unset|revert|revert-layer)$/
const RESERVED_NAMES = /^(none|auto|match-element|initial|inherit|unset|revert|revert-layer)$/

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

const isPageWide = (node: ChildNode) =>
  (node.type === 'atrule' &&
    (PAGE_WIDE_AT_RULE.test(node.name) || (node.name === 'layer' && !node.nodes))) ||
  (node.type === 'rule' && node.selector.includes('::view-transition'))

const targetsDocumentRoot = (selector: string) =>
  /^(:root|html|body)(?![\w-])/.test(split(selector, ' >+~').at(-1) ?? '')

/**
 * Names CSS keeps page-wide get a suffix unique to the app, in their definitions and in the app's
 * references, so another app defining the same name can't replace them:
 * - `@keyframes`, used by `animation` and `animation-name`
 * - `@counter-style` the app defines, used by `list-style(-type)`, `counter(s)()`, `system`, `fallback`
 * - cascade layers, in `@layer` and `@import … layer()`
 * - `@font-palette-values`, `@position-try` and `anchor-name`, whose `--names` are suffixed wherever they appear
 * - `view-transition-name` and `-class`, and the pseudo-elements that select them
 * Font families and registered properties keep their names: apps also use those from JS.
 */
function suffixPageWideNames(css: Root, suffix: string) {
  const ident = (name: string) => `${name}-${suffix}`
  const dashed = (value: string) => value.replaceAll(/(?<![\w-])(--[\w-]+)/g, `$1-${suffix}`)
  const layer = (name: string) =>
    name
      .split('.')
      .map((part) => ident(part))
      .join('.')
  const counterStyles = new Set<string>()
  css.walkAtRules('counter-style', (rule) => {
    counterStyles.add(rule.params.trim())
  })
  const counterStyle = (name: string) => (counterStyles.has(name) ? ident(name) : name)

  css.walkAtRules((rule) => {
    if (rule.name.endsWith('keyframes') || rule.name === 'counter-style') {
      rule.params = ident(rule.params.trim())
    } else if (rule.name === 'font-palette-values' || rule.name === 'position-try') {
      rule.params = dashed(rule.params)
    } else if (rule.name === 'layer' && rule.params) {
      rule.params = split(rule.params, ',')
        .map((name) => layer(name))
        .join(', ')
    } else if (rule.name === 'import') {
      rule.params = rule.params.replace(
        /layer\(([^)]+)\)/,
        (_, name: string) => `layer(${layer(name.trim())})`,
      )
    }
  })

  css.walkDecls((declaration) => {
    const prop = declaration.prop.replace(/^-webkit-/, '')
    let value = declaration.value
    if (prop === 'animation-name') {
      value = split(value, ',')
        .map((name) => (RESERVED_NAMES.test(name) || name.includes('var(') ? name : ident(name)))
        .join(', ')
    } else if (prop === 'animation') {
      value = split(value, ',')
        .map((animation) => {
          if (animation.includes('var(')) return animation
          const tokens = split(animation, ' ')
          const name = tokens.findIndex(
            (token) => /^-?[a-z_][\w-]*$/i.test(token) && !ANIMATION_KEYWORDS.test(token),
          )
          if (name !== -1) tokens[name] = ident(tokens[name])

          return tokens.join(' ')
        })
        .join(', ')
    } else if (/^(list-style(-type)?|system|fallback)$/.test(prop)) {
      value = split(value, ' ')
        .map((name) => counterStyle(name))
        .join(' ')
    } else if (
      /^(font-palette|position-try(-fallbacks)?|anchor-name|position-anchor)$/.test(prop)
    ) {
      value = dashed(value)
    } else if (prop === 'view-transition-name' || prop === 'view-transition-class') {
      value = split(value, ' ')
        .map((name) => (RESERVED_NAMES.test(name) ? name : ident(name)))
        .join(' ')
    }

    value = value
      .replaceAll(/\b(counters?)\(([^)]*)\)/g, (_, fn: string, args: string) => {
        const parts = args.split(',')
        parts[parts.length - 1] = counterStyle(parts.at(-1)!.trim())

        return `${fn}(${parts.join(',')})`
      })
      .replaceAll(
        /\b(anchor(?:-size)?)\(([^)]*)\)/g,
        (_, fn: string, args: string) => `${fn}(${dashed(args)})`,
      )
    if (value !== declaration.value) declaration.value = value
  })

  css.walkRules(/::view-transition/, (rule) => {
    rule.selector = rule.selector.replaceAll(
      /(::view-transition-(?:group|image-pair|old|new)\()\s*([\w-]+)\s*\)/g,
      (match, pseudo: string, name: string) =>
        name === 'root' ? match : `${pseudo}${ident(name)})`,
    )
  })
}

/**
 * Selectors written for a whole page, retargeted to the app's scope roots: its island and its portal roots.
 * - `:root`, `html` and `body` rules apply to the island. Portal roots, often full-screen overlays, only get
 *   what they'd inherit from `body`, so a `body` background doesn't paint over the Dashboard.
 * - A plain selector in `@scope` only matches below the scope root, but a portal root is often the very
 *   element its class styles, so each selector also matches a portal root itself.
 * - `.dark { --token: … }` usually matches `<html>`, which sits outside every scope, so token-only rules also
 *   apply below an `<html>` that matches them.
 */
function retarget(rule: Rule) {
  const roots = rule.selectors.filter((selector) => targetsDocumentRoot(selector))
  const others = rule.selectors.filter((selector) => !targetsDocumentRoot(selector))
  const declarations = rule.nodes.filter((node) => node.type === 'decl')
  const tokensOnly =
    declarations.length > 0 &&
    declarations.every((declaration) => declaration.prop.startsWith('--'))
  const inherited = declarations.filter((declaration) => INHERITED.test(declaration.prop))

  if (roots.length > 0 && inherited.length > 0) {
    rule.cloneAfter({
      nodes: inherited.map((declaration) => declaration.clone()),
      selectors: roots.map((root) => `${root} :scope[${PORTAL}]`),
    })
  }

  rule.selectors = [
    ...others,
    ...others
      .filter((selector) => !selector.includes('::'))
      .map((selector) => `:scope[${PORTAL}]:is(${selector})`),
    ...(tokensOnly
      ? others
          .filter(
            (selector) => /^[.[]|^:(?!:)/.test(selector) && split(selector, ' >+~').length === 1,
          )
          .map((selector) => `:root${selector} :scope`)
      : []),
    ...roots.map((root) => `${root} :scope:not([${PORTAL}])`),
  ]
}

/**
 * Everything else in the stylesheet moves into `@scope`, so it only matches inside the app's scope roots.
 * At-rules with page-wide names stay outside, because `@scope` can't hold them, and so do view transition
 * pseudo-elements, which hang off `<html>`.
 */
function wrapInScope(css: Root, scopeRoot: string) {
  const scoped = css.nodes.filter((node) => !isPageWide(node))
  if (scoped.length === 0) return

  const scope = postcss.atRule({name: 'scope', params: `(${scopeRoot})`})
  scope.append(scoped)
  css.append(scope)
  const rules: Rule[] = []
  scope.walkRules((rule) => {
    const parent = rule.parent
    const nested = parent?.type === 'rule'
    const keyframe = parent?.type === 'atrule' && (parent as AtRule).name.endsWith('keyframes')
    if (!nested && !keyframe) rules.push(rule)
  })
  for (const rule of rules) retarget(rule)
}

function suffixOf(slug: string) {
  let hash = 0x81_1c_9d_c5
  for (const char of slug) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01_00_01_93)

  return (hash >>> 0).toString(36)
}

/** Rewrites one of the app's stylesheets so it only applies to the app's islands and portals. */
export function scopeAppCss(css: Root, slug: string) {
  suffixPageWideNames(css, suffixOf(slug))
  wrapInScope(css, `[data-app-scope=${JSON.stringify(slug)}]`)
}
