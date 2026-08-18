// `import = require()` is needed to exercise the package's CommonJS declaration path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import groq = require('groq')

const query: '*[_type == "product"]' = groq.defineQuery('*[_type == "product"]')
const interpolatedQuery: string = groq`*[_type == ${'product'}]`

void query
void interpolatedQuery
