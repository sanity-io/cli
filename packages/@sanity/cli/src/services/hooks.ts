import {getGlobalCliClient} from '@sanity/cli-core'

import {HOOK_API_VERSION} from '../actions/hook/constants.js'
import {type DeliveryAttempt, type Hook, type HookMessage} from '../actions/hook/types.js'

export async function getHooksForProject(projectId: string): Promise<Hook[]> {
  const client = await getGlobalCliClient({
    apiVersion: HOOK_API_VERSION,
    requireUser: true,
  })

  return client.request<Hook[]>({url: `/hooks/projects/${projectId}`})
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
    url: `/hooks/projects/${projectId}/${hookId}/messages`,
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
    url: `/hooks/projects/${projectId}/${hookId}/attempts`,
  })
}

export async function getHookAttempt({
  attemptId,
  projectId,
}: {
  attemptId: string
  projectId: string
}): Promise<DeliveryAttempt> {
  const client = await getGlobalCliClient({
    apiVersion: HOOK_API_VERSION,
    requireUser: true,
  })

  return client.request<DeliveryAttempt>({
    url: `/hooks/projects/${projectId}/attempts/${attemptId}`,
  })
}

export async function listHooksForProject(projectId: string): Promise<Hook[]> {
  const client = await getGlobalCliClient({
    apiVersion: HOOK_API_VERSION,
    requireUser: true,
  })

  return client.request<Hook[]>({url: `/hooks/projects/${projectId}`})
}

export async function deleteHookForProject(projectId: string, hookId: string): Promise<void> {
  const client = await getGlobalCliClient({
    apiVersion: HOOK_API_VERSION,
    requireUser: true,
  })

  return client.request({method: 'DELETE', url: `/hooks/projects/${projectId}/${hookId}`})
}
