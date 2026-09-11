# GROQ query helpers

This package provides no-op helpers for declaring
[GROQ](https://www.sanity.io/docs/specifications/groq-syntax) queries. They return the exact
same string at runtime while helping editor integrations and Sanity TypeGen identify queries.

## Installing

```sh
npm install groq
```

## Automatic type inference

Use `defineQuery` with `@sanity/codegen` or Sanity TypeGen to preserve the query's literal type
and get generated result types:

```ts
import {defineQuery} from 'groq'

const query = defineQuery(`*[_type == "product"][0...10]`)
```

## Tagged template literal

The default export is a tagged template literal that marks a string as GROQ for editor
integrations such as [vscode-sanity](https://github.com/sanity-io/vscode-sanity):

```js
import groq from 'groq'

const query = groq`*[_type == "product"][0...10]`
```

`defineQuery` is preferred for type inference because TypeScript cannot currently infer a
template literal's exact type. See
[microsoft/TypeScript#33304](https://github.com/microsoft/TypeScript/issues/33304).

## License

MIT-licensed. See `LICENSE`.
