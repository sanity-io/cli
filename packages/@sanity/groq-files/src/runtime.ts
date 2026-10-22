const GROQ_ID = /\.groq(?:\?.*)?$/

export function isGroqRequest(id: string): boolean {
  const path = id.split('\0').pop() ?? id
  return GROQ_ID.test(path)
}

/**
 * Module source a bundler evaluates for a `.groq` import: the trimmed query string as the
 * default export, and nothing else. The types live in the virtual module.
 */
export function createRuntimeModule(content: string): string {
  return `export default ${JSON.stringify(sliceQuery(content).query)}\n`
}

export function sliceQuery(content: string): {offset: number; query: string} {
  let text = content
  let offset = 0
  if (text.codePointAt(0) === 0xfe_ff) {
    text = text.slice(1)
    offset = 1
  }
  const trimmedStart = text.trimStart()
  offset += text.length - trimmedStart.length
  return {offset, query: trimmedStart.trimEnd()}
}
