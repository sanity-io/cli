import {Favicons} from './Favicons.js'
import {GlobalErrorHandler} from './GlobalErrorHandler.js'
import {NoJavascript} from './NoJavascript.js'

const globalStyles = `
  @font-face {
    font-family: Inter;
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-Regular.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: italic;
    font-weight: 400;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-Italic.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-Medium.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: italic;
    font-weight: 500;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-MediumItalic.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: normal;
    font-weight: 600;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-SemiBold.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: italic;
    font-weight: 600;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-SemiBoldItalic.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-Bold.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: italic;
    font-weight: 700;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-BoldItalic.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: normal;
    font-weight: 800;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-ExtraBold.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: italic;
    font-weight: 800;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-ExtraBoldItalic.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: normal;
    font-weight: 900;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-Black.woff2") format("woff2");
  }
  @font-face {
    font-family: Inter;
    font-style: italic;
    font-weight: 900;
    font-display: swap;
    src: url("https://studio-static.sanity.io/Inter-BlackItalic.woff2") format("woff2");
  }
  html {
    @media (prefers-color-scheme: dark) {
      background-color: #13141b;
    }
    @media (prefers-color-scheme: light) {
      background-color: #ffffff;
    }
  }
  html,
  body,
  #sanity {
    height: 100%;
  }
  body {
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }
`

/**
 * @hidden
 * @beta
 */
export interface DefaultDocumentProps {
  entryPath: string

  // Currently unused, but kept for potential future use
  basePath?: string

  css?: string[]
}

const EMPTY_ARRAY: never[] = []

/**
 * @internal
 */
export function DefaultDocument(props: DefaultDocumentProps): React.JSX.Element {
  const {css = EMPTY_ARRAY, entryPath} = props

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
          name="viewport"
        />
        <meta content="noindex" name="robots" />
        <meta content="same-origin" name="referrer" />

        <Favicons />

        <title>Sanity Studio</title>

        <GlobalErrorHandler />

        {css.map((href) => (
          <link href={href} key={href} rel="stylesheet" />
        ))}
        <style dangerouslySetInnerHTML={{__html: globalStyles}} />
      </head>
      <body>
        <div id="sanity" />
        <script src={entryPath} type="module" />
        <NoJavascript />
      </body>
    </html>
  )
}
