import path from 'node:path'

import {logSymbols, type Output} from '@sanity/cli-core'
import chalk from 'chalk'

const baseUrl =
  process.env.SANITY_INTERNAL_ENV === 'staging' ? 'https://sanity.work' : 'https://www.sanity.io'

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
  const manageUrl = `${baseUrl}/manage${projectId ? `/project/${projectId}/studios` : ''}`
  const cliConfigFile = cliConfigPath ? path.basename(cliConfigPath) : 'sanity.cli.ts/.js'
  output.warn(
    `${logSymbols.warning} No ${chalk.bold('appId')} configured. This ${appType} will auto-update to the ${chalk.green.bold('latest')} channel. To enable fine grained version selection, head over to ${chalk.cyan(manageUrl)} and add the appId to the ${chalk.bold('deployment')} section in ${chalk.bold(cliConfigFile)}.
        `,
  )
}
