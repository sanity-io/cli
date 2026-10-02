// Dependency-free detection shared with `sanity`, bundled at build time
import {
  detectPackageManagerFromAgent,
  getYarnMajorVersion,
} from '../../@sanity/cli-core/src/util/packageManager.js'
import {
  detectPackageRunner,
  getRunnerCommand,
  type PackageRunner,
} from '../../@sanity/cli/src/util/update/packageRunner.js'

/**
 * The package runner that started us (`npm create` → npx, `pnpm create` →
 * pnpm dlx, `yarn create` → yarn dlx, `bun create` → bunx), from our own
 * install path or, failing that, the package manager's user agent. Yarn 1 has
 * no `dlx`, so it falls back to npx like anything unrecognized.
 */
export function resolveRunner(
  binaryPath = process.argv[1],
  userAgent = process.env.npm_config_user_agent ?? '',
): PackageRunner {
  const detected = detectPackageRunner(binaryPath)
  if (detected) return detected
  switch (detectPackageManagerFromAgent(userAgent)) {
    case 'bun': {
      return 'bunx'
    }
    case 'pnpm': {
      return 'pnpm-dlx'
    }
    case 'yarn': {
      return (getYarnMajorVersion(userAgent) ?? 1) >= 2 ? 'yarn-dlx' : 'npx'
    }
    default: {
      return 'npx'
    }
  }
}

/** `sanity <args>` from the pinned `@sanity/cli`, through the runner that started us */
export function pinnedCliCommand(cliVersion: string, args: string[]): string[] {
  return getRunnerCommand(resolveRunner(), {bin: 'sanity', pkg: `@sanity/cli@${cliVersion}`}, args)
}

function quoteForCmd(arg: string): string {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replaceAll('"', '""')}"` : arg
}

/**
 * Spawn arguments for a command. Package managers are `.cmd` shims on Windows,
 * which only run through a shell, so arguments are quoted for `cmd.exe` there.
 */
export function spawnArgs(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): {args: string[]; command: string; shell: boolean} {
  if (platform !== 'win32' || command === process.execPath) return {args, command, shell: false}
  return {args: args.map((arg) => quoteForCmd(arg)), command: quoteForCmd(command), shell: true}
}
