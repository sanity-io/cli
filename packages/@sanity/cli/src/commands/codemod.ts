import {execSync, spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {codemods} from '../actions/codemods/index.js'
import {type CodeMod} from '../actions/codemods/types.js'

export class CodemodCommand extends SanityCommand<typeof CodemodCommand> {
  static override args = {
    codemodName: Args.string({
      description: 'Name of the codemod to run',
      required: false,
    }),
  }

  static override description = 'Updates Sanity Studio codebase with a code modification script'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Show available code mods',
    },
    {
      command: '<%= config.bin %> <%= command.id %> reactIconsV3 --dry',
      description: 'Run codemod to transform react-icons imports (dry run)',
    },
  ]

  static override flags = {
    dry: Flags.boolean({
      default: false,
      description: 'Dry run (no changes are made to files)',
    }),
    extensions: Flags.string({
      default: 'js,ts,tsx',
      description: 'Transform files with these file extensions (comma separated)',
    }),
    'no-verify': Flags.boolean({
      default: false,
      description: 'Skip verification steps before running codemod',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CodemodCommand)
    const {codemodName} = args
    const workDir = process.cwd()

    if (!codemodName) {
      this.printMods()
      return
    }

    // Make a record where all the keys of the available codemods are lowercased,
    // eg `reactIconsV3` turns into `{reacticonsv3: CodeMod}`
    const normalizedMods: Map<string, CodeMod> = new Map()
    for (const [originalName, mod] of Object.entries(codemods)) {
      normalizedMods.set(originalName.toLowerCase(), mod)
    }

    // Verify that mod exists
    const mod = normalizedMods.get(codemodName.toLowerCase())
    if (!mod) {
      this.error(`Codemod with name "${codemodName}" not found`, {exit: 1})
    }

    // Verify if there is any verification defined, and user has not opted out of it
    if (typeof mod.verify === 'function' && !flags['no-verify']) {
      try {
        await mod.verify({workDir})
      } catch (error) {
        this.error(`Verification failed: ${error}`, {exit: 1})
      }
    }

    // If extensions are defined, they come in as CSV, so split and normalize them
    const exts = flags.extensions
      ? flags.extensions.split(',').map((ext) => ext.trim().replace(/^\./, ''))
      : ['js', 'ts', 'tsx']

    const dryRun = flags.dry

    // We use npx to run jscodeshift, so verify that it exists and works before using it
    this.ensureNpx()

    // If there is a gitignore in the target folder, we want to use that to know
    // which folders to ignore - eg `dist`, `coverage` or whatever
    const hasGitIgnore = existsSync(path.join(workDir, '.gitignore'))

    // Build the CLI command arguments
    const cliRoot = path.resolve(import.meta.dirname, '../..')
    const modPath = path.resolve(path.join(cliRoot, 'codemods', mod.filename))
    const cmdArgs = [
      'jscodeshift',
      '--ignore-pattern',
      'node_modules',
      '--ignore-pattern',
      'dist',
      hasGitIgnore && '--ignore-config',
      hasGitIgnore && '.gitignore',
      '-t',
      modPath,
      '--extensions',
      exts.join(','),
      dryRun && '--dry',
      workDir,
    ].filter((item): item is string => typeof item === 'string')

    const child = spawn('npx', cmdArgs, {
      stdio: 'inherit',
    })

    const handleSigint = () => {
      child.kill(2)
    }

    process.on('SIGINT', handleSigint)

    child.on('close', (code) => {
      process.removeListener('SIGINT', handleSigint)
      this.exit(code || undefined)
    })
  }

  private ensureNpx(): void {
    try {
      const npxHelp = execSync('npx --help', {encoding: 'utf8'})
      if (!npxHelp.includes('npm')) {
        this.error('Not the npx we expected', {exit: 1})
      }
    } catch {
      this.error(
        `Failed to run "npx" - required to run codemods. Do you have a recent version of npm installed?`,
        {exit: 1},
      )
    }
  }

  private printMods(): void {
    this.log('Available code modifications:\n')

    for (const [modName, mod] of Object.entries(codemods)) {
      this.log(`${modName} - ${mod.purpose}`)
    }
  }
}
