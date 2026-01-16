import {getGlobalCliClient} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'

const TELEMETRY_API_VERSION = 'v2023-12-18'

export async function sendEvents(batch: TelemetryEvent[]) {
  const client = await getGlobalCliClient({
    apiVersion: TELEMETRY_API_VERSION,
    requireUser: true,
  })

  const projectId = process.env.SANITY_TELEMETRY_PROJECT_ID

  return client.request({
    body: {batch, projectId},
    json: true,
    method: 'POST',
    uri: '/intake/batch',
  })
}
