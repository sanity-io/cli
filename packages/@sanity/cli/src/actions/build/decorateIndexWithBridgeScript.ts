/**
 * Decorates the given HTML template with a script
 * tag that loads the bridge component to communicate
 * with core-ui.
 *
 * @internal
 */
export function decorateIndexWithBridgeScript(template: string): string {
  const sanityEnv = process.env.SANITY_INTERNAL_ENV || 'production'

  /**
   * The URL to the bridge script is determined by the
   * `SANITY_INTERNAL_ENV` environment variable. So if you deploy
   * a studio to the staging ENV then you'll get the correct script.
   */
  const scriptURL =
    sanityEnv === 'production'
      ? 'https://core.sanity-cdn.com/bridge.js'
      : 'https://core.sanity-cdn.work/bridge.js'

  return template.replace(
    '</head>',
    `<script src="${scriptURL}" async type="module" data-sanity-core></script>\n</head>`,
  )
}
