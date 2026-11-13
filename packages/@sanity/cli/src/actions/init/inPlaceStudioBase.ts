import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {applyEdits, type FormattingOptions, modify, parse, type ParseError} from 'jsonc-parser'

import {flagOrDefault, shouldPrompt} from './initHelpers.js'
import {
  standaloneSanityCliTemplate,
  standaloneSanityConfigTemplate,
  studioSourceFolder,
} from './templates/nextjs/index.js'
import {type InitOptions} from './types.js'
import {writeOrOverwrite, writeSourceFiles} from './writeFiles.js'

const STUDIO_OUTPUT_DIR = 'studio-static'

// Deploy builds into the same folder as studio:build. `sanity deploy` with no
// directory writes to `dist`, which Astro and other frameworks already use.
const STUDIO_BUILD_COMMAND = `sanity build ${STUDIO_OUTPUT_DIR}`
const STUDIO_DEPLOY_COMMAND = `sanity deploy ${STUDIO_OUTPUT_DIR}`

const STUDIO_SCRIPTS = {
  studio: 'sanity dev',
  'studio:build': STUDIO_BUILD_COMMAND,
  'studio:deploy': STUDIO_DEPLOY_COMMAND,
} as const

const STUDIO_TSCONFIG_EXCLUDES = ['.sanity', STUDIO_OUTPUT_DIR]

const STUDIO_GITIGNORE_ENTRIES = [
  {line: '.sanity/', name: '.sanity'},
  {line: `${STUDIO_OUTPUT_DIR}/`, name: STUDIO_OUTPUT_DIR},
]

/**
 * Writes the root `sanity.config` and `sanity.cli` files for a Studio that runs
 * on its own dev server. Project ID and dataset are inlined, so the Studio does
 * not depend on framework env variables.
 */
export async function writeInPlaceStudioConfig({
  autoUpdates,
  datasetName,
  fileExtension,
  options,
  projectId,
  workDir,
}: {
  autoUpdates: boolean
  datasetName: string
  fileExtension: string
  options: InitOptions
  projectId: string
  workDir: string
}): Promise<void> {
  await writeOrOverwrite(
    path.join(workDir, `sanity.config.${fileExtension}`),
    standaloneSanityConfigTemplate(projectId, datasetName),
    workDir,
    options,
  )
  await writeOrOverwrite(path.join(workDir, 'sanity', 'static', '.gitkeep'), '', workDir, options)
  await writeOrOverwrite(
    path.join(workDir, `sanity.cli.${fileExtension}`),
    standaloneSanityCliTemplate(autoUpdates, projectId, datasetName),
    workDir,
    options,
  )
}

/** Writes the schema and structure files under `sanity/` (or `src/sanity/`). */
export async function writeStudioSource({
  fileExtension,
  options,
  srcFolderPrefix = false,
  template,
  useTypeScript,
  workDir,
}: {
  fileExtension: string
  options: InitOptions
  srcFolderPrefix?: boolean
  template: 'blog' | 'clean'
  useTypeScript: boolean
  workDir: string
}): Promise<void> {
  await writeSourceFiles({
    fileExtension,
    files: studioSourceFolder(useTypeScript, template),
    folderPath: undefined,
    options,
    srcFolderPrefix,
    workDir,
  })
}

/**
 * Adds the Studio scripts, excludes Studio build output from TypeScript, and
 * ignores it in git. Each step warns and continues when a file cannot be updated.
 */
export async function updateStudioProjectFiles({
  options,
  output,
  workDir,
}: {
  options: InitOptions
  output: Output
  workDir: string
}): Promise<void> {
  await addStudioScripts({options, output, workDir})
  await excludeStudioOutputFromTsconfig({output, workDir})
  await appendStudioGitignore(workDir)
}

export function scriptCommand(packageManager: string, script: string): string {
  if (packageManager === 'yarn' || packageManager === 'pnpm' || packageManager === 'bun') {
    return `${packageManager} ${script}`
  }

  return `npm run ${script}`
}

function detectIndent(source: string): string {
  return source.match(/\n([ \t]+)\S/)?.[1] ?? '  '
}

/** tsconfig.json is JSONC: comments and trailing commas are valid. */
function formattingOptions(source: string): FormattingOptions {
  const indent = detectIndent(source)
  const tabCount = indent.match(/^\t+/)?.[0].length ?? 0
  return {
    eol: source.includes('\r\n') ? '\r\n' : '\n',
    insertFinalNewline: source.endsWith('\n'),
    insertSpaces: tabCount === 0,
    tabSize: tabCount > 0 ? tabCount : Math.max(indent.length, 1),
  }
}

function parseTsconfig(source: string): {exclude?: unknown} | undefined {
  const errors: ParseError[] = []
  const value: unknown = parse(source, errors, {allowTrailingComma: true})
  if (errors.length > 0 || !isRecord(value)) return undefined
  return value
}

function isRecord(value: unknown): value is {exclude?: unknown} {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function addStudioScripts({
  options,
  output,
  workDir,
}: {
  options: InitOptions
  output: Output
  workDir: string
}): Promise<void> {
  const pkgPath = path.join(workDir, 'package.json')
  if (!existsSync(pkgPath)) {
    output.warn(
      `No package.json found. Add a "studio" script that runs \`sanity dev\`, plus "studio:build" (\`${STUDIO_BUILD_COMMAND}\`) and "studio:deploy" (\`${STUDIO_DEPLOY_COMMAND}\`).`,
    )
    return
  }

  const raw = await readFile(pkgPath, 'utf8')
  let pkg: {scripts?: Record<string, string>}
  try {
    pkg = JSON.parse(raw) as {scripts?: Record<string, string>}
  } catch {
    output.warn(
      `Couldn't update package.json. Add a "studio" script that runs \`sanity dev\`, plus "studio:build" (\`${STUDIO_BUILD_COMMAND}\`) and "studio:deploy" (\`${STUDIO_DEPLOY_COMMAND}\`).`,
    )
    return
  }

  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    output.warn(
      `Couldn't update package.json. Add a "studio" script that runs \`sanity dev\`, plus "studio:build" (\`${STUDIO_BUILD_COMMAND}\`) and "studio:deploy" (\`${STUDIO_DEPLOY_COMMAND}\`).`,
    )
    return
  }

  pkg.scripts ??= {}
  const scripts = pkg.scripts
  let changed = false

  for (const [name, command] of Object.entries(STUDIO_SCRIPTS)) {
    const existing = scripts[name]
    if (existing === undefined || existing === command) {
      if (existing !== command) {
        scripts[name] = command
        changed = true
      }
      continue
    }

    let overwrite = flagOrDefault(options.overwriteFiles, false)
    if (shouldPrompt(options.unattended, options.overwriteFiles)) {
      overwrite = await confirm({
        default: false,
        message: `Script ${name} already exists. Overwrite it with \`${command}\`?`,
      })
    }

    if (overwrite) {
      scripts[name] = command
      changed = true
    } else {
      output.warn(
        `Script "${name}" already exists. Left \`${existing}\` in place. The Studio uses \`${command}\`.`,
      )
    }
  }

  if (!changed) return

  await writeFile(pkgPath, `${JSON.stringify(pkg, null, detectIndent(raw))}\n`)
}

async function excludeStudioOutputFromTsconfig({
  output,
  workDir,
}: {
  output: Output
  workDir: string
}): Promise<void> {
  const tsconfigPath = path.join(workDir, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return

  const raw = await readFile(tsconfigPath, 'utf8')
  const tsconfig = parseTsconfig(raw)
  if (!tsconfig) {
    output.warn(
      'Couldn\'t update tsconfig.json. Add ".sanity" and "studio-static" to exclude so TypeScript skips Studio build output.',
    )
    return
  }

  const exclude = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : undefined
  const existing = (exclude ?? []).filter((entry): entry is string => typeof entry === 'string')
  const missing = STUDIO_TSCONFIG_EXCLUDES.filter((entry) => !existing.includes(entry))
  if (missing.length === 0) return

  const formatting = formattingOptions(raw)
  try {
    let updated = raw
    if (exclude) {
      let index = exclude.length
      for (const entry of missing) {
        updated = applyEdits(
          updated,
          modify(updated, ['exclude', index], entry, {
            formattingOptions: formatting,
            isArrayInsertion: true,
          }),
        )
        index += 1
      }
    } else {
      updated = applyEdits(
        updated,
        modify(updated, ['exclude'], [...existing, ...missing], {formattingOptions: formatting}),
      )
    }
    await writeFile(tsconfigPath, updated)
  } catch {
    output.warn(
      'Couldn\'t update tsconfig.json. Add ".sanity" and "studio-static" to exclude so TypeScript skips Studio build output.',
    )
  }
}

function gitignoreCovers(lines: string[], name: string): boolean {
  return lines.some((line) => {
    const trimmed = line.trim()
    return (
      trimmed === name ||
      trimmed === `/${name}` ||
      trimmed === `${name}/` ||
      trimmed === `/${name}/`
    )
  })
}

async function appendStudioGitignore(workDir: string): Promise<void> {
  const gitignorePath = path.join(workDir, '.gitignore')
  if (!existsSync(gitignorePath)) return

  const raw = await readFile(gitignorePath, 'utf8')
  const lines = raw.split('\n')
  const missing = STUDIO_GITIGNORE_ENTRIES.filter((entry) => !gitignoreCovers(lines, entry.name))
  if (missing.length === 0) return

  const separator = raw.endsWith('\n') || raw.length === 0 ? '' : '\n'
  const block = `${separator}\n# Sanity Studio\n${missing.map((entry) => entry.line).join('\n')}\n`
  await writeFile(gitignorePath, `${raw}${block}`)
}
