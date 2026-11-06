import {getGlobalCliClient} from '@sanity/cli-core'
import {getCliExecutionContext} from '@sanity/cli-core/executionContext'
import {createRequester} from '@sanity/cli-core/request'

/**
 * Adapt runtime-cli's fetch API to the CLI's authenticated transport and API
 * environment, including a programmatic invocation's custom fetch.
 */
export async function createAppFunctionTransport(): Promise<{
  fetchFn: typeof fetch
  token: string
}> {
  // Package export; doImport accepts filesystem paths.
  // eslint-disable-next-line no-restricted-syntax
  const {BLUEPRINTS_API_VERSION} = await import('@sanity/runtime-cli/functions/stack')
  const client = await getGlobalCliClient({
    apiVersion: BLUEPRINTS_API_VERSION,
    requireUser: true,
  })
  const token = client.config().token
  if (!token) throw new Error('Run sanity login before using app functions.')
  const request = createRequester({
    as: 'text',
    fetch: getCliExecutionContext()?.fetch,
    httpErrors: false,
  })
  const fetchFn: typeof fetch = async (input, init) => {
    const outgoing = new Request(input, init)
    const original = new URL(outgoing.url)
    const apiPath = original.pathname.replace(/^\/v[^/]+(?=\/blueprints\/)/, '')
    if (!apiPath.startsWith('/blueprints/')) {
      throw new Error(`Unexpected app function API path: ${apiPath}`)
    }
    const response = await request({
      as: 'text',
      body: ['GET', 'HEAD'].includes(outgoing.method) ? undefined : await outgoing.text(),
      headers: Object.fromEntries(outgoing.headers.entries()),
      method: outgoing.method,
      query: original.searchParams,
      signal: outgoing.signal,
      // Keep runtime-cli's endpoint version while selecting the CLI's API environment.
      url: new URL(original.pathname, client.getUrl('/')).toString(),
    })
    return new Response([204, 205, 304].includes(response.status) ? null : response.body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    })
  }
  return {fetchFn, token}
}
