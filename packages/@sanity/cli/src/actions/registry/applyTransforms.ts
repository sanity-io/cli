import {readFile, writeFile} from 'node:fs/promises'
import {join, relative} from 'node:path'

import {applyEdits, modify} from 'jsonc-parser'

import {type RegistryManifest, type RegistryTransform, type StudioLayout} from './types.js'

interface ApplyTransformsOptions {
  dryRun: boolean
  manifest: RegistryManifest
  projectRoot: string
  studioLayout: StudioLayout
}

interface ApplyTransformsResult {
  manualSteps: string[]
  skippedFiles: Array<{file: string; reason: string}>
  updatedFiles: string[]
}

export async function applyTransforms(
  options: ApplyTransformsOptions,
): Promise<ApplyTransformsResult> {
  const {dryRun, manifest, projectRoot, studioLayout} = options
  const manualSteps: string[] = []
  const skippedFiles: Array<{file: string; reason: string}> = []
  const updatedFiles = new Set<string>()

  for (const transform of manifest.transforms ?? []) {
    if (transform.type === 'sanityConfigPlugin') {
      const result = await applySanityConfigPluginTransform({
        dryRun,
        projectRoot,
        studioConfigPath: studioLayout.studioConfigPath,
        transform,
      })

      if (result.manualStep) manualSteps.push(result.manualStep)
      if (result.skipped) skippedFiles.push(result.skipped)
      if (result.updatedFile) updatedFiles.add(result.updatedFile)
      continue
    }

    const schemaTargetPath = studioLayout.schemaIndexPath
    const result = await applySchemaExportTransform({
      dryRun,
      projectRoot,
      schemaIndexPath: schemaTargetPath,
      transform,
    })
    if (result.manualStep) manualSteps.push(result.manualStep)
    if (result.skipped) skippedFiles.push(result.skipped)
    if (result.updatedFile) updatedFiles.add(result.updatedFile)
  }

  const dependencyResult = await applyPackageDependencyUpdates({dryRun, manifest, projectRoot})
  if (dependencyResult.manualStep) manualSteps.push(dependencyResult.manualStep)
  if (dependencyResult.skipped) skippedFiles.push(dependencyResult.skipped)
  if (dependencyResult.updatedFile) updatedFiles.add(dependencyResult.updatedFile)

  return {
    manualSteps,
    skippedFiles,
    updatedFiles: [...updatedFiles],
  }
}

async function applySanityConfigPluginTransform(options: {
  dryRun: boolean
  projectRoot: string
  studioConfigPath: string
  transform: Extract<RegistryTransform, {type: 'sanityConfigPlugin'}>
}): Promise<{
  manualStep?: string
  skipped?: {file: string; reason: string}
  updatedFile?: string
}> {
  const {dryRun, projectRoot, studioConfigPath, transform} = options
  const relativeConfigPath = relative(projectRoot, studioConfigPath)
  const content = await readFile(studioConfigPath, 'utf8')

  let nextContent = content
  const importLine = `import {${transform.importName}} from '${transform.importPath}'`
  if (!content.includes(transform.importPath)) {
    nextContent = `${importLine}\n${nextContent}`
  }

  const pluginsMatch = nextContent.match(/plugins\s*:\s*\[([\s\S]*?)\]/m)
  if (!pluginsMatch || !pluginsMatch[1]) {
    return {
      manualStep: `Could not update "${relativeConfigPath}" automatically. Add ${transform.pluginCall} to its plugins array manually.`,
      skipped: {file: relativeConfigPath, reason: 'plugins array not found'},
    }
  }

  if (pluginsMatch[1].includes(transform.pluginCall)) {
    return {skipped: {file: relativeConfigPath, reason: 'plugin already configured'}}
  }

  const existingItems = pluginsMatch[1].trim()
  const replacement = existingItems
    ? `plugins: [${existingItems}, ${transform.pluginCall}]`
    : `plugins: [${transform.pluginCall}]`

  nextContent = nextContent.replace(pluginsMatch[0], replacement)
  if (nextContent === content) {
    return {skipped: {file: relativeConfigPath, reason: 'no deterministic changes available'}}
  }

  if (!dryRun) {
    await writeFile(studioConfigPath, nextContent, 'utf8')
  }

  return {updatedFile: relativeConfigPath}
}

async function applySchemaExportTransform(options: {
  dryRun: boolean
  projectRoot: string
  schemaIndexPath: string
  transform: Extract<RegistryTransform, {type: 'schemaTypeExport'}>
}): Promise<{
  manualStep?: string
  skipped?: {file: string; reason: string}
  updatedFile?: string
}> {
  const {dryRun, projectRoot, schemaIndexPath, transform} = options
  let content: string
  try {
    content = await readFile(schemaIndexPath, 'utf8')
  } catch {
    return {
      manualStep: `Could not find schema index "${relative(projectRoot, schemaIndexPath)}". Create it and export ${transform.importName}.`,
      skipped: {file: relative(projectRoot, schemaIndexPath), reason: 'schema index not found'},
    }
  }

  const relativeSchemaIndexPath = relative(projectRoot, schemaIndexPath)
  const importLine = `import {${transform.importName}} from '${transform.importPath}'`
  let nextContent = content.includes(transform.importPath) ? content : `${importLine}\n${content}`

  if (nextContent.includes(transform.importName)) {
    const alreadyInArray = nextContent
      .match(/\[(?<items>[\s\S]*?)\]/m)
      ?.groups?.items?.includes(transform.importName)
    if (alreadyInArray) {
      return {skipped: {file: relativeSchemaIndexPath, reason: 'schema export already configured'}}
    }
  }

  const exportConstMatch = nextContent.match(/export const schemaTypes\s*=\s*\[([\s\S]*?)\]/m)
  if (exportConstMatch?.[1] === undefined) {
    const exportDefaultMatch = nextContent.match(/export default\s*\[([\s\S]*?)\]/m)
    if (exportDefaultMatch?.[1] === undefined) {
      return {
        manualStep: `Could not update "${relativeSchemaIndexPath}" automatically. Add ${transform.importName} to your exported schema types array manually.`,
        skipped: {file: relativeSchemaIndexPath, reason: 'schema export array not found'},
      }
    } else {
      const existing = exportDefaultMatch[1].trim()
      const replacement = existing
        ? `export default [${existing}, ${transform.importName}]`
        : `export default [${transform.importName}]`
      nextContent = nextContent.replace(exportDefaultMatch[0], replacement)
    }
  } else {
    const existing = exportConstMatch[1].trim()
    const replacement = existing
      ? `export const schemaTypes = [${existing}, ${transform.importName}]`
      : `export const schemaTypes = [${transform.importName}]`
    nextContent = nextContent.replace(exportConstMatch[0], replacement)
  }

  if (!dryRun) {
    await writeFile(schemaIndexPath, nextContent, 'utf8')
  }

  return {updatedFile: relativeSchemaIndexPath}
}

async function applyPackageDependencyUpdates(options: {
  dryRun: boolean
  manifest: RegistryManifest
  projectRoot: string
}): Promise<{
  manualStep?: string
  skipped?: {file: string; reason: string}
  updatedFile?: string
}> {
  const {dryRun, manifest, projectRoot} = options
  const packageJsonPath = join(projectRoot, 'package.json')

  if (!manifest.dependencies) {
    return {}
  }

  let content: string
  try {
    content = await readFile(packageJsonPath, 'utf8')
  } catch {
    return {
      manualStep: 'Manifest requests dependencies, but package.json was not found.',
      skipped: {file: 'package.json', reason: 'not found'},
    }
  }

  let nextContent = content
  const allConflicts: string[] = []
  for (const section of ['dependencies', 'devDependencies'] as const) {
    const requested = manifest.dependencies[section]
    if (!requested || Object.keys(requested).length === 0) continue

    for (const [dependencyName, requestedVersion] of Object.entries(requested)) {
      const addEdits = modify(nextContent, [section, dependencyName], requestedVersion, {
        formattingOptions: {insertSpaces: true, tabSize: 2},
        getInsertionIndex: (items) => items.length,
      })
      const candidateContent = applyEdits(nextContent, addEdits)
      const parsedCurrent = JSON.parse(nextContent) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const existingVersion = parsedCurrent[section]?.[dependencyName]
      if (existingVersion && existingVersion !== requestedVersion) {
        allConflicts.push(`${dependencyName} (${existingVersion} != ${requestedVersion})`)
        continue
      }

      nextContent = candidateContent
    }
  }

  if (allConflicts.length > 0) {
    return {
      manualStep: `Dependency conflicts in package.json: ${allConflicts.join(', ')}. Update them manually.`,
      skipped: {file: 'package.json', reason: 'dependency version conflicts'},
    }
  }

  if (nextContent === content) return {}
  if (!dryRun) await writeFile(packageJsonPath, nextContent, 'utf8')
  return {updatedFile: 'package.json'}
}
