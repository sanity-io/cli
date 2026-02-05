import {detectCliInstallation} from '../../../util/packageManager/installationInfo/detectCliInstallation.js'
import {
  type CheckMessage,
  type CheckResult,
  type DoctorCheck,
  type DoctorContext,
} from '../types.js'

export const cliInstallationCheck: DoctorCheck = {
  name: 'cli-installation',
  title: 'CLI Installation',

  async run(context: DoctorContext): Promise<CheckResult> {
    const info = await detectCliInstallation({cwd: context.cwd})
    const messages: CheckMessage[] = []

    // Check if we're in a studio folder (sanity is declared or installed)
    const sanityPkg = info.packages.sanity
    const isStudioFolder = sanityPkg?.declared || sanityPkg?.installed

    if (!isStudioFolder) {
      messages.push({
        text: 'No Sanity studio detected in this directory. Run inside a studio folder for full diagnostics.',
        type: 'info',
      })
      return {messages, status: 'passed'}
    }

    // Map issues to messages
    if (info.issues.length === 0) {
      // Everything is fine — brief success
      const version = sanityPkg?.installed?.version
      messages.push({
        text: version ? `sanity@${version} — no issues found` : 'No issues found',
        type: 'success',
      })
    } else {
      // Add each issue as a self-contained message
      for (const issue of info.issues) {
        const suggestions: string[] = []
        if (issue.suggestion) {
          suggestions.push(issue.suggestion)
        }

        messages.push({
          suggestions: suggestions.length > 0 ? suggestions : undefined,
          text: issue.message,
          type:
            issue.severity === 'error'
              ? 'error'
              : issue.severity === 'warning'
                ? 'warning'
                : 'info',
        })
      }
    }

    // Determine overall status
    const hasErrors = info.issues.some((i) => i.severity === 'error')
    const hasWarnings = info.issues.some((i) => i.severity === 'warning')
    const status = hasErrors ? 'error' : hasWarnings ? 'warning' : 'passed'

    return {messages, status}
  },
}
