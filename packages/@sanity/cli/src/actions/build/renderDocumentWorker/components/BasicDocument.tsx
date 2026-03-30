/**
 * App HTML Document, this is in the _internal package
 * to avoid importing styled-components from sanity package
 */

import {type JSX} from 'react'

import {Favicons} from './Favicons.js'
import {GlobalErrorHandler} from './GlobalErrorHandler.js'
import {NoJavascript} from './NoJavascript.js'

/**
 * @internal
 */
interface BasicDocumentProps {
  entryPath: string

  // Currently unused, but kept for potential future use
  basePath?: string

  css?: string[]
  title?: string
}

const EMPTY_ARRAY: never[] = []

/**
 * This is the equivalent of DefaultDocument for non-studio apps.
 * @internal
 */
export function BasicDocument(props: BasicDocumentProps): JSX.Element {
  const {css = EMPTY_ARRAY, entryPath, title} = props

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1, viewport-fit=cover" name="viewport" />
        <meta content="noindex" name="robots" />
        <meta content="same-origin" name="referrer" />

        <Favicons />
        <title>{title || 'Sanity App'}</title>
        <GlobalErrorHandler />

        {css.map((href) => (
          <link href={href} key={href} rel="stylesheet" />
        ))}
      </head>
      <body>
        <div id="root" />
        <script src={entryPath} type="module" />
        <NoJavascript />
      </body>
    </html>
  )
}
