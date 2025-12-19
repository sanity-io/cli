import {logSymbols} from '@sanity/cli-core'
import {convertToTree, formatTree, maxKeyLength, type Tree} from '@sanity/cli-core/tree'
import {type Path, type ValidationMarker} from '@sanity/types'
import chalk from 'chalk'

import {Level} from '../../../types'
import {type DocumentValidationResult, isTty, levelValues} from './util.js'

interface FormatDocumentValidationOptions extends DocumentValidationResult {
  basePath?: string
  studioHost?: string
}

interface Marker extends Pick<ValidationMarker, 'level' | 'message'> {
  path: Path
}

type ValidationTree = Tree<Marker>

const levelHeaders = {
  error: isTty ? chalk.bold(chalk.bgRed(chalk.black(' ERROR '))) : chalk.red('[ERROR]'),
  info: isTty ? chalk.bold(chalk.cyan(chalk.black(' INFO '))) : chalk.cyan('[INFO]'),
  warning: isTty ? chalk.bold(chalk.bgYellow(chalk.black(' WARN '))) : chalk.yellow('[WARN]'),
}
/**
 * Creates a terminal hyperlink. Only outputs a hyperlink if the output is
 * determined to be a TTY
 */
const link = (text: string, url: string) =>
  isTty ? `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007` : chalk.underline(text)

/**
 * For sorting markers
 */
const compareLevels = <T extends {level: Level; message: string}>(a: T, b: T) =>
  levelValues[a.level] - levelValues[b.level]

/**
 * Formats the markers at the root of the validation tree
 */
const formatRootErrors = (root: ValidationTree, hasChildren: boolean, paddingLength: number) => {
  if (!root.nodes) return ''

  const [first, ...rest] = [...root.nodes].toSorted(compareLevels)
  if (!first) return ''

  const firstElbow = hasChildren ? '│ ' : '└─'
  const firstPadding = '.'.repeat(paddingLength - 6)
  const firstLine = `${firstElbow} (root) ${firstPadding} ${logSymbols[first.level]} ${
    first.message
  }`
  const subsequentPadding = ' '.repeat(paddingLength + 2)
  const subsequentElbow = hasChildren ? '│ ' : '  '

  const restOfLines = rest
    .map(
      (marker) =>
        `${subsequentElbow}${subsequentPadding} ${logSymbols[marker.level]} ${marker.message}`,
    )
    .join('\n')
  return [firstLine, restOfLines].filter(Boolean).join('\n')
}

/**
 * Formats document validation results into a user-friendly tree structure
 */
export function formatDocumentValidation({
  documentId,
  documentType,
  intentUrl,
  level,
  markers,
}: FormatDocumentValidationOptions): string {
  const tree = convertToTree<Marker>(markers)

  const documentTypeHeader = isTty
    ? chalk.bgWhite(chalk.black(` ${documentType} `))
    : `[${documentType}]`

  const header = `${levelHeaders[level]} ${documentTypeHeader} ${
    intentUrl ? link(documentId, intentUrl) : chalk.underline(documentId)
  }`

  const paddingLength = Math.max(maxKeyLength(tree.children) + 2, 30)

  const childErrors = formatTree<Marker>({
    getMessage: (marker) => [logSymbols[marker.level], marker.message].join(' '),
    getNodes: ({nodes}) => [...(nodes ?? [])].toSorted(compareLevels),
    node: tree.children,
    paddingLength,
  })

  const rootErrors = formatRootErrors(tree, childErrors.length > 0, paddingLength)

  return [header, rootErrors, childErrors].filter(Boolean).join('\n')
}
