import {type ChunkModule, type ChunkStats} from '../actions/build/buildStaticFiles.js'
import {formatSize} from './formatSize.js'

export function formatModuleSizes(modules: ChunkModule[]): string {
  const lines: string[] = []
  for (const mod of modules) {
    lines.push(` - ${formatModuleName(mod.name)} (${formatSize(mod.renderedLength)})`)
  }

  return lines.join('\n')
}

function formatModuleName(modName: string): string {
  const delimiter = '/node_modules/'
  const nodeIndex = modName.lastIndexOf(delimiter)
  return nodeIndex === -1 ? modName : modName.slice(nodeIndex + delimiter.length)
}

export function sortModulesBySize(chunks: ChunkStats[]): ChunkModule[] {
  return chunks
    .flatMap((chunk) => chunk.modules)
    .sort((modA, modB) => modB.renderedLength - modA.renderedLength)
}
