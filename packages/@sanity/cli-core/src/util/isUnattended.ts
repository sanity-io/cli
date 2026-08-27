interface IsUnattendedOptions {
  isInteractive: boolean

  json?: boolean
  yes?: boolean
}

interface IsUnattendedInvocationOptions {
  argv: string[]
  isInteractive: boolean
}

export function isUnattended({isInteractive, json, yes}: IsUnattendedOptions): boolean {
  return Boolean(yes || json || !isInteractive)
}

export function isUnattendedInvocation({
  argv,
  isInteractive,
}: IsUnattendedInvocationOptions): boolean {
  const separatorIndex = argv.indexOf('--')
  const optionArguments = argv.slice(0, separatorIndex === -1 ? argv.length : separatorIndex)

  return isUnattended({
    isInteractive,
    json: optionArguments.includes('--json'),
    yes: optionArguments.some((argument) => argument === '--yes' || argument === '-y'),
  })
}
