import {type WorkbenchExposes} from '../../resolveWorkbenchApp.js'

/** A view or service as the deploy report and `--json` output surface it. */
export interface DeployedInterface {
  name: string
  src: string
  title: string
  type: string
}

const label = (item: {name: string; title: string}) =>
  item.title === item.name ? item.name : `${item.title} (${item.name})`

/**
 * One `Title (name): src` report line per declared entry point.
 * @internal
 */
export function summarizeGroup(
  heading: string,
  items: readonly {name: string; src: string; title: string}[],
): string {
  return `${heading}:\n${items.map((item) => `  ${label(item)}: ${item.src}`).join('\n')}`
}

/**
 * One report line per non-empty group, alongside the records `--json` reports.
 * @internal
 */
export function summarizeInterfaces({services, views}: WorkbenchExposes): {
  lines: string[]
  services: DeployedInterface[]
  views: DeployedInterface[]
} {
  const toInterface = (decl: DeployedInterface): DeployedInterface => ({
    name: decl.name,
    src: decl.src,
    title: decl.title,
    type: decl.type,
  })
  const deployedViews = (views ?? []).map((view) => toInterface(view))
  const deployedServices = (services ?? []).map((service) => toInterface(service))

  const lines: string[] = []
  if (deployedViews.length > 0) lines.push(summarizeGroup('Views', deployedViews))
  if (deployedServices.length > 0) lines.push(summarizeGroup('Services', deployedServices))
  return {lines, services: deployedServices, views: deployedViews}
}
