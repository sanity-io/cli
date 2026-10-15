import {type Plugin} from 'vite'

/**
 * `@sanity/ui` v5's cascade-layer namespace. Its stylesheet (which the
 * `sanity` root barrel side-effect imports under the `ui5` npm alias) keeps
 * all component styles in class-scoped rules under `@layer sui`, and its
 * document-wide reset (`*{margin:0;padding:0;...}` and friends) in
 * `@layer sui.global` blocks.
 */
const SUI_GLOBAL_LAYER = '@layer sui.global'

/**
 * Remove every `@layer sui.global { ... }` block, keeping the rest of the
 * stylesheet. Layer *statements* (`@layer sui;` / `@layer sui.global;`),
 * which only declare ordering, are left alone.
 *
 * The scanner brace-counts from each block's opening brace; it does not
 * tokenize strings/urls, which is fine for the known content of these blocks
 * (a reset and a font-face) — and a miscount would only under- or over-strip
 * dev styling, never break the build.
 */
export function stripSuiGlobalLayer(css: string): string {
  let out = css
  let from = 0
  for (;;) {
    const at = out.indexOf(SUI_GLOBAL_LAYER, from)
    if (at === -1) return out
    // The layer name must end here (not `sui.globalish`), and the at-rule
    // must open a block — otherwise it is an ordering statement; skip it.
    let cursor = at + SUI_GLOBAL_LAYER.length
    while (cursor < out.length && /\s/.test(out[cursor])) cursor += 1
    const boundary = out[at + SUI_GLOBAL_LAYER.length]
    if (out[cursor] !== '{' || (boundary !== undefined && !/[\s{,;]/.test(boundary))) {
      from = at + SUI_GLOBAL_LAYER.length
      continue
    }
    let depth = 0
    let end = -1
    for (let index = cursor; index < out.length; index += 1) {
      if (out[index] === '{') depth += 1
      else if (out[index] === '}') {
        depth -= 1
        if (depth === 0) {
          end = index
          break
        }
      }
    }
    if (end === -1) return out // unbalanced: leave the rest untouched
    out = out.slice(0, at) + out.slice(end + 1)
    from = at
  }
}

/**
 * Why strip anything: Media Library config apps bundle the `sanity` barrel
 * (field modules and the island runtime import it), and the barrel
 * side-effect imports `@sanity/ui` v5's stylesheet. Its `@layer sui.global`
 * reset is document-wide, and in dev the config app's modules execute inside
 * the Media Library host's page — so the reset restyles the host (strips
 * body padding etc.). The class-scoped component styles in the same file are
 * harmless to the host and *needed* by islands: `renderDefault` leaf inputs
 * render Studio components that increasingly carry `sui-*` classes. So keep
 * the component styles, drop only the global layer.
 *
 * Why match on content (the `@layer sui.global` marker) rather than the
 * import specifier or file path: the `ui5` alias is the `sanity` package's
 * internal name for `@sanity/ui` v5 and can be renamed or re-pathed in any
 * sanity release; the layer name is the stylesheet's own public CSS surface
 * and travels with the file wherever it resolves from.
 */
export function stripSuiGlobalReset(): Plugin {
  return {
    enforce: 'pre',
    name: 'sanity/strip-sui-global-reset',
    transform(code, id) {
      if (!id.split('?', 1)[0].endsWith('.css')) return null
      if (!code.includes(SUI_GLOBAL_LAYER)) return null
      const next = stripSuiGlobalLayer(code)
      return next === code ? null : {code: next, map: null}
    },
  }
}
