import {isatty} from 'node:tty'

import {type Migration, type Mutation, type NodePatch, type Transaction} from '@sanity/migrate'
import {type KeyedSegment} from '@sanity/types'
import chalk from 'chalk'

import {convertToTree, formatTree, maxKeyLength} from '../tree.js'

type ItemRef = number | string
type Impact = 'destructive' | 'incremental' | 'maybeDestructive'
type Variant = 'info' | Impact

const isTty = isatty(1)

interface FormatterOptions<Subject> {
  migration: Migration
  subject: Subject

  indentSize?: number
}

export function prettyFormat({
  indentSize = 0,
  migration,
  subject,
}: FormatterOptions<(Mutation | Transaction)[] | Mutation | Transaction>): string {
  return (Array.isArray(subject) ? subject : [subject])
    .map((subjectEntry) => {
      if (subjectEntry.type === 'transaction') {
        return [
          [
            badge('transaction', 'info'),
            subjectEntry.id === undefined ? null : chalk.underline(subjectEntry.id),
          ]
            .filter(Boolean)
            .join(' '),
          indent(
            prettyFormat({
              indentSize: indentSize,
              migration,
              subject: subjectEntry.mutations,
            }),
          ),
        ].join('\n\n')
      }
      return prettyFormatMutation({
        indentSize,
        migration,
        subject: subjectEntry,
      })
    })
    .join('\n\n')
}

function encodeItemRef(ref: KeyedSegment | number): ItemRef {
  return typeof ref === 'number' ? ref : ref._key
}

function badgeStyle(variant: Variant): typeof chalk {
  const styles: Record<Variant, typeof chalk> = {
    destructive: chalk.bgRed.black.bold,
    incremental: chalk.bgGreen.black.bold,
    info: chalk.bgWhite.black,
    maybeDestructive: chalk.bgYellow.black.bold,
  }

  return styles[variant]
}

function badge(label: string, variant: Variant): string {
  if (!isTty) {
    return `[${label}]`
  }

  return badgeStyle(variant)(` ${label} `)
}

const mutationImpact: Record<Mutation['type'], Impact> = {
  create: 'incremental',
  createIfNotExists: 'incremental',
  createOrReplace: 'maybeDestructive',
  delete: 'destructive',
  patch: 'maybeDestructive',
}

function documentId(mutation: Mutation): string | undefined {
  if ('id' in mutation) {
    return mutation.id
  }

  if ('document' in mutation) {
    return mutation.document._id
  }

  return undefined
}

const listFormatter = new Intl.ListFormat('en-US', {
  type: 'disjunction',
})

function mutationHeader(mutation: Mutation, migration: Migration): string {
  const mutationType = badge(mutation.type, mutationImpact[mutation.type])

  const documentType =
    'document' in mutation || migration.documentTypes
      ? badge(
          'document' in mutation
            ? mutation.document._type
            : listFormatter.format(migration.documentTypes ?? []),
          'info',
        )
      : null

  // TODO: Should we list documentType when a mutation can be yielded for any document type?
  return [mutationType, documentType, chalk.underline(documentId(mutation))]
    .filter(Boolean)
    .join(' ')
}

export function prettyFormatMutation({
  indentSize = 0,
  migration,
  subject,
}: FormatterOptions<Mutation>): string {
  const lock =
    'options' in subject ? chalk.cyan(`(if revision==${subject.options?.ifRevision})`) : ''
  const header = [mutationHeader(subject, migration), lock].join(' ')
  const padding = ' '.repeat(indentSize)

  if (
    subject.type === 'create' ||
    subject.type === 'createIfNotExists' ||
    subject.type === 'createOrReplace'
  ) {
    return [header, '\n', indent(JSON.stringify(subject.document, null, 2), indentSize)].join('')
  }

  if (subject.type === 'patch') {
    const tree = convertToTree<NodePatch>(subject.patches.flat())
    const paddingLength = Math.max(maxKeyLength(tree.children) + 2, 30)

    return [
      header,
      '\n',
      formatTree<NodePatch>({
        getMessage: (patch) => formatPatchMutation(patch),
        indent: padding,
        node: tree.children,
        paddingLength,
      }),
    ].join('')
  }

  return header
}

function formatPatchMutation(patch: NodePatch): string {
  const {op} = patch
  const formattedType = chalk.bold(op.type)
  if (op.type === 'unset') {
    return `${chalk.red(formattedType)}()`
  }
  if (op.type === 'diffMatchPatch') {
    return `${chalk.yellow(formattedType)}(${op.value})`
  }
  if (op.type === 'inc' || op.type === 'dec') {
    return `${chalk.yellow(formattedType)}(${op.amount})`
  }
  if (op.type === 'set') {
    return `${chalk.yellow(formattedType)}(${JSON.stringify(op.value)})`
  }
  if (op.type === 'setIfMissing') {
    return `${chalk.green(formattedType)}(${JSON.stringify(op.value)})`
  }
  if (op.type === 'insert') {
    return `${chalk.green(formattedType)}(${op.position}, ${encodeItemRef(
      op.referenceItem,
    )}, ${JSON.stringify(op.items)})`
  }
  if (op.type === 'replace') {
    return `${chalk.yellow(formattedType)}(${encodeItemRef(op.referenceItem)}, ${JSON.stringify(
      op.items,
    )})`
  }
  if (op.type === 'truncate') {
    return `${chalk.red(formattedType)}(${op.startIndex}, ${op.endIndex})`
  }
  // @ts-expect-error all cases are covered
  throw new Error(`Invalid operation type: ${op.type}`)
}

function indent(subject: string, size = 2): string {
  const padding = ' '.repeat(size)

  return subject
    .split('\n')
    .map((line) => padding + line)
    .join('\n')
}
