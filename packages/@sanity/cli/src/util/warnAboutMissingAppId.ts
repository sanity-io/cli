import {type Output} from '@sanity/cli-core'
import chalk from 'chalk'

const baseUrl =
  process.env.SANITY_INTERNAL_ENV === 'staging' ? 'https://sanity.work' : 'https://sanity.io'

export function warnAboutMissingAppId({
  output,
  projectId,
}: {
  output: Output
  projectId: string | undefined
}) {
  const manageUrl = `${baseUrl}/manage${projectId ? `/project/${projectId}/studios` : ''}`

  output.warn(
    `No ${chalk.bold('appId')} configured. This studio will auto-update to the ${chalk.green.bold('latest')} channel. To enable fine grained version selection, copy your appId from ${chalk.cyan(manageUrl)} and add it to the ${chalk.bold('deployment')} section in ${chalk.bold('sanity.cli.ts')} or ${chalk.bold('sanity.cli.js')}.
        `,
  )
}
