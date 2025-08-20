import {getGlobalCliClient} from '@sanity/cli-core'

import {HOOK_API_VERSION} from '../actions/hook/constants.js'
import {type DeliveryAttempt, type Hook, type HookMessage} from '../actions/hook/types.js'

export async function getHooksForProject(projectId: string): Promise<Hook[]> {
  const client = await getGlobalCliClient({
    apiVersion: HOOK_API_VERSION,
    requireUser: true,
  })

  return client.request<Hook[]>({uri: `/hooks/projects/${projectId}`})
}

export async function getHookMessagesForProject({
  hookId,
  projectId,
}: {
  hookId: string
  projectId: string
}): Promise<HookMessage[]> {
  const client = await getGlobalCliClient({
    apiVersion: HOOK_API_VERSION,
    requireUser: true,
  })

  return client.request<HookMessage[]>({
    uri: `/hooks/projects/${projectId}/${hookId}/messages`,
  })
}

export async function getHookAttemptsForProject({
  hookId,
  projectId,
}: {
  hookId: string
  projectId: string
}): Promise<DeliveryAttempt[]> {
  const client = await getGlobalCliClient({
    apiVersion: HOOK_API_VERSION,
    requireUser: true,
  })

  return client.request<DeliveryAttempt[]>({
    uri: `/hooks/projects/${projectId}/${hookId}/attempts`,
  })
}
