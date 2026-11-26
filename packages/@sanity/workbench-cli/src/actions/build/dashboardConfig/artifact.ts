import {DASHBOARD_CONFIG_CONTRACT_VERSION, DASHBOARD_CONFIG_TYPE} from '../../../contract.js'
import {type GeneratedArtifact} from '../artifact.js'
import {HOT_CONFIG_LISTENERS} from '../hotConfigListeners.js'

export function dashboardConfigArtifacts(dashboardConfig: {src: string}): GeneratedArtifact[] {
  return [
    {
      expose: `./${DASHBOARD_CONFIG_TYPE}`,
      path: `${DASHBOARD_CONFIG_TYPE}.js`,
      source: ({resolveImport}) => `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
export const type = ${JSON.stringify(DASHBOARD_CONFIG_TYPE)}
export const version = ${DASHBOARD_CONFIG_CONTRACT_VERSION}

${HOT_CONFIG_LISTENERS}
const {default: config} = await import(${JSON.stringify(resolveImport(dashboardConfig.src))})
export {config}
`,
    },
  ]
}
