/**
 * App HTML Document, this is in the _internal package
 * to avoid importing styled-components from sanity pacakge
 */

import {type JSX} from 'react'

import {Favicons} from './Favicons'
import {GlobalErrorHandler} from './GlobalErrorHandler'
import {NoJavascript} from './NoJavascript'

/**
 * @internal
 */
interface BasicDocumentProps {
  entryPath: string

  // Currently unused, but kept for potential future use
  basePath?: string
  css?: string[]
}

const EMPTY_ARRAY: never[] = []

/**
 * This is the equivalent of DefaultDocument for non-studio apps.
 * @internal
 */
export function BasicDocument(props: BasicDocumentProps): JSX.Element {
  const {css = EMPTY_ARRAY, entryPath} = props

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1, viewport-fit=cover" name="viewport" />
        <meta content="noindex" name="robots" />
        <meta content="same-origin" name="referrer" />

        <Favicons />
        <title>Sanity CORE App</title>
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
