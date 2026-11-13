---
'@sanity/cli': minor
'@sanity/cli-build': minor
'@sanity/cli-core': minor
---

Add the `unstable_documentComponent` option to `sanity.cli.ts`. It controls whether `sanity dev` and `sanity build` render a custom HTML document from `_document.js` or `_document.tsx` in the project root.

The option defaults to `true`, so nothing changes for existing projects. Custom document components are being phased out and are planned to be off in Sanity Studio v7. When the option is `false`, the CLI skips the `_document` lookup, renders the default document, and warns if a `_document.*` file exists.

To migrate, move your HTML changes into a Vite plugin in the `vite` option. `sanity dev` runs `transformIndexHtml`. `sanity build` emits `index.html` as a bundle asset, so edit it in `generateBundle`:

```ts
import {defineCliConfig} from 'sanity/cli'
import {type Plugin} from 'vite'

function customHtml(transform: (html: string) => string): Plugin {
  return {
    name: 'custom-html',
    // `sanity dev`
    transformIndexHtml: (html) => transform(html),
    // `sanity build`
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const asset = bundle['index.html']
        if (asset?.type === 'asset' && typeof asset.source === 'string') {
          asset.source = transform(asset.source)
        }
      },
    },
  }
}

export default defineCliConfig({
  unstable_documentComponent: false,
  vite: (config) => ({
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      customHtml((html) =>
        html.replace('</head>', '<meta name="theme-color" content="#101112" /></head>'),
      ),
    ],
  }),
})
```
