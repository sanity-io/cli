import {styleText} from 'node:util'

export const SUMMARY_LOOKUP_TIMEOUT_MS = 3000

export function formatSummary({
  durationMs,
  heading,
  isApp,
  organization,
  title,
  url,
  version,
}: {
  durationMs: number
  heading: string
  isApp: boolean
  organization?: string
  title?: string
  url: string
  version?: string
}): string {
  const seconds = (durationMs / 1000).toFixed(1)
  const titleRow = title ? `\n    ${(isApp ? 'App' : 'Studio').padEnd(12)}  ${title}` : ''
  const link = styleText(['blue', 'underline'], url)
  const versionRow = version ? `\n    Version       ${version}` : ''

  return `
  ${heading} in ${seconds}s

    Organization  ${organization}${titleRow}
    URL           ${link}${versionRow}
`
}
