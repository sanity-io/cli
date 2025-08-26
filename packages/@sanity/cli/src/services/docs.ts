import {getSanityUrl} from '@sanity/cli-core'

const DOCS_API_TIMEOUT = 10_000

interface ReadDocOptions {
  path: string
}

export interface SearchResult {
  description: string
  path: string
  title: string
}

interface SearchDocsOptions {
  query: string

  limit?: number
}

function isSearchResult(obj: unknown): obj is SearchResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'description' in obj &&
    'path' in obj &&
    'title' in obj &&
    typeof (obj as SearchResult).description === 'string' &&
    typeof (obj as SearchResult).path === 'string' &&
    typeof (obj as SearchResult).title === 'string'
  )
}

export async function readDoc(options: ReadDocOptions): Promise<string> {
  try {
    const url = `${getSanityUrl()}${options.path}.md`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DOCS_API_TIMEOUT)

    const response = await fetch(url, {
      headers: {
        Accept: 'text/plain',
      },
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Article not found: ${options.path}`)
      }
      throw new Error('The article API is currently unavailable. Please try again later.')
    }

    const markdownContent = await response.text()
    return markdownContent
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('The article API is currently unavailable. Please try again later.')
  }
}

export async function searchDocs(options: SearchDocsOptions): Promise<SearchResult[]> {
  const {limit = 10} = options

  const baseUrl = `${getSanityUrl()}/docs/api/search/semantic`
  const url = new URL(baseUrl)
  url.searchParams.set('query', options.query)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DOCS_API_TIMEOUT)

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    method: 'GET',
    signal: controller.signal,
  })

  clearTimeout(timeoutId)

  if (!response.ok) {
    throw new Error(
      'The documentation search API is currently unavailable. Please try again later.',
    )
  }

  const results: unknown = await response.json()

  if (!Array.isArray(results)) {
    throw new TypeError('Invalid response format from documentation search API')
  }

  const validResults = results.filter((item): item is SearchResult => isSearchResult(item))
  return validResults.slice(0, limit)
}
