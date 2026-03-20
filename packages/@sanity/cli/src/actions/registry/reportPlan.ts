import {type AddRegistryResult} from './types.js'

export function buildRegistryResult(result: AddRegistryResult): AddRegistryResult {
  return {
    ...result,
    addedFiles: [...new Set(result.addedFiles)].toSorted(),
    manualSteps: [...new Set(result.manualSteps)],
    skippedFiles: dedupeSkipped(result.skippedFiles),
    updatedFiles: [...new Set(result.updatedFiles)].toSorted(),
  }
}

function dedupeSkipped(
  skippedFiles: AddRegistryResult['skippedFiles'],
): AddRegistryResult['skippedFiles'] {
  const deduped = new Map<string, {file: string; reason: string}>()
  for (const entry of skippedFiles) {
    deduped.set(`${entry.file}::${entry.reason}`, entry)
  }
  return [...deduped.values()].toSorted((a, b) => a.file.localeCompare(b.file))
}
