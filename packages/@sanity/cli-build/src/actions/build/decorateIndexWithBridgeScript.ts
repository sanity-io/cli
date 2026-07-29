import {isStaging} from '@sanity/cli-core/util'

/**
 * Decorates the given HTML template with a script
 * tag that loads the bridge component to communicate
 * with core-ui.
 *
 * @internal
 */
export function decorateIndexWithBridgeScript(template: string): string {
  /**
   * The URL to the bridge script is determined by the active Sanity
   * environment. So if you deploy a studio to the staging environment,
   * then you'll get the correct script.
   */
  const scriptURL = isStaging()
    ? 'https://core.sanity-cdn.work/bridge.js'
    : 'https://core.sanity-cdn.com/bridge.js'

  return template.replace(
    '</head>',
    `<script src="${scriptURL}" async type="module" data-sanity-core></script>\n</head>`,
  )
}
