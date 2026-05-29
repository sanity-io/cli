import {isStaging} from '@sanity/cli-core'

/**
 * Decorates the given HTML template with a script tag that sets
 * `globalThis.__SANITY_STAGING__` to `true` when building in a
 * staging environment. The script is injected as the first child
 * of `<head>` so it runs before any module scripts.
 *
 * @internal
 */
export function decorateIndexWithStagingScript(template: string): string {
  if (!isStaging()) {
    return template
  }

  return template.replace(
    /<head([^>]*)>/,
    '<head$1>\n<script>globalThis.__SANITY_STAGING__ = true</script>',
  )
}
