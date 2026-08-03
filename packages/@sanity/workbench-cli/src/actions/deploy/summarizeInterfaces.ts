import {type WorkbenchExposes} from '../../resolveWorkbenchApp.js'

/** A view or service as the deploy report and `--json` output surface it. */
export interface DeployedExpose {
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
export function summarizeExposeGroup(
  heading: string,
  items: readonly {name: string; src: string; title: string}[],
): string {
  return `${heading}:\n${items.map((item) => `  ${label(item)}: ${item.src}`).join('\n')}`
}

/**
 * The deploy summary of an app's exposes: the structured records (for `--json`)
 * and one report line per non-empty group (for the human report).
 * @internal
 */
export function summarizeInterfaces({services, views}: WorkbenchExposes): {
  exposes: DeployedExpose[]
  lines: string[]
} {
  const toExpose = (decl: DeployedExpose): DeployedExpose => ({
    name: decl.name,
    src: decl.src,
    title: decl.title,
    type: decl.type,
  })
  const viewExposes = (views ?? []).map((view) => toExpose(view))
  const serviceExposes = (services ?? []).map((service) => toExpose(service))

  const lines: string[] = []
  if (viewExposes.length > 0) lines.push(summarizeExposeGroup('Views', viewExposes))
  if (serviceExposes.length > 0) lines.push(summarizeExposeGroup('Services', serviceExposes))
  return {exposes: [...viewExposes, ...serviceExposes], lines}
}
