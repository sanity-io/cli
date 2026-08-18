import groq = require('groq')

const query: '*[_type == "product"]' = groq.defineQuery('*[_type == "product"]')
const interpolatedQuery: string = groq`*[_type == ${'product'}]`

void query
void interpolatedQuery
