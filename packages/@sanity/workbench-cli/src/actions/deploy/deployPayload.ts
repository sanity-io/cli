import {type DeployableWorkbenchApp} from './getWorkbench.js'
import {type DeployedView, type DeployedWebWorker} from './summarizeInterfaces.js'

/** What a workbench app contributes to a deploy payload. */
export interface WorkbenchDeployPayload {
  slug: string
  title: string

  /** Media-library config summary. */
  config?: string
  services?: DeployedWebWorker[]
  views?: DeployedView[]
  visibility?: string
}

/**
 * Gated once so a plain app can't pick up a stray key: without a workbench
 * there is nothing to contribute. `views` and `services` travel together.
 */
export function toWorkbenchPayload(
  workbench: DeployableWorkbenchApp | null,
  {
    config,
    interfaces,
    title,
  }: {
    config?: string
    interfaces: {services: DeployedWebWorker[]; views: DeployedView[]} | null
    title: string
  },
): Partial<WorkbenchDeployPayload> {
  if (!workbench) return {}
  const {services, views} = interfaces ?? {services: [], views: []}
  return {
    ...(config ? {config} : {}),
    ...(services.length > 0 || views.length > 0 ? {services, views} : {}),
    slug: workbench.slug,
    title,
    ...(workbench.visibility ? {visibility: workbench.visibility} : {}),
  }
}
