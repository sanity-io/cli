import path from 'node:path'
import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import {isStaging} from '@sanity/cli-core/util'
import {logSymbols} from '@sanity/cli-core/ux'

export function warnAboutMissingAppId({
  appType,
  cliConfigPath,
  output,
  projectId,
}: {
  appType: 'app' | 'studio'
  cliConfigPath?: string
  output: Output
  projectId?: string
}) {
  const baseUrl = isStaging() ? 'https://sanity.work' : 'https://www.sanity.io'
  const manageUrl = `${baseUrl}/manage${projectId ? `/project/${projectId}/studios` : ''}`
  const cliConfigFile = cliConfigPath ? path.basename(cliConfigPath) : 'sanity.cli.ts/.js'
  output.warn(
    `${logSymbols.warning} No ${styleText('bold', 'appId')} configured. This ${appType} will auto-update to the ${styleText(['green', 'bold'], 'latest')} channel. To enable fine grained version selection, head over to ${styleText('cyan', manageUrl)} and add the appId to the ${styleText('bold', 'deployment')} section in ${styleText('bold', cliConfigFile)}.
        `,
  )
}
