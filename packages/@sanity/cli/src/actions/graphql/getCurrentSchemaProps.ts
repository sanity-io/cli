import {getProjectCliClient} from '@sanity/cli-core'

import {getUrlHeaders} from '../../services/getUrlHeaders.js'

const apiVersion = 'v2026-01-27'

export async function getCurrentSchemaProps(
  projectId: string,
  dataset: string,
  tag: string,
): Promise<{
  currentGeneration?: string
  playgroundEnabled?: boolean
}> {
  try {
    const client = await getProjectCliClient({
      apiVersion,
      projectId,
    })

    const uri = `/apis/graphql/${dataset}/${tag}`
    const config = client.config()
    const apiUrl = `${config.url}/${uri.replace(/^\//, '')}`

    const res = await getUrlHeaders(apiUrl, {
      Authorization: `Bearer ${client.config().token}`,
    })

    return {
      currentGeneration: res['x-sanity-graphql-generation'],
      playgroundEnabled: res['x-sanity-graphql-playground'] === 'true',
    }
  } catch (err) {
    if (err.statusCode === 404) {
      return {}
    }

    throw err
  }
}
