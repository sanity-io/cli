import {isatty} from 'node:tty'
import {styleText} from 'node:util'

import {type Migration, type Mutation, type NodePatch, type Transaction} from '@sanity/migrate'
import {type KeyedSegment} from '@sanity/types'

import {convertToTree, formatTree, maxKeyLength} from './tree.js'

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
            subjectEntry.id === undefined ? null : styleText('underline', subjectEntry.id),
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

function badgeStyle(variant: Variant, label: string) {
  const styles: Record<Variant, string> = {
    destructive: styleText(['bgRed', 'black', 'bold'], label),
    incremental: styleText(['bgGreen', 'black', 'bold'], label),
    info: styleText(['bgWhite', 'black'], label),
    maybeDestructive: styleText(['bgYellow', 'black', 'bold'], label),
  }

  return styles[variant]
}

function badge(label: string, variant: Variant): string {
  if (!isTty) {
    return `[${label}]`
  }

  return badgeStyle(variant, ` ${label} `)
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
  return [mutationType, documentType, styleText('underline', documentId(mutation) ?? '')]
    .filter(Boolean)
    .join(' ')
}

function prettyFormatMutation({
  indentSize = 0,
  migration,
  subject,
}: FormatterOptions<Mutation>): string {
  const lock =
    'options' in subject ? styleText('cyan', `(if revision==${subject.options?.ifRevision})`) : ''
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
        getMessage: (patch: NodePatch) => formatPatchMutation(patch),
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
  const formattedType = styleText('bold', op.type)
  if (op.type === 'unset') {
    return `${styleText('red', formattedType)}()`
  }
  if (op.type === 'diffMatchPatch') {
    return `${styleText('yellow', formattedType)}(${op.value})`
  }
  if (op.type === 'inc' || op.type === 'dec') {
    return `${styleText('yellow', formattedType)}(${op.amount})`
  }
  if (op.type === 'set') {
    return `${styleText('yellow', formattedType)}(${JSON.stringify(op.value)})`
  }
  if (op.type === 'setIfMissing') {
    return `${styleText('green', formattedType)}(${JSON.stringify(op.value)})`
  }
  if (op.type === 'insert') {
    return `${styleText('green', formattedType)}(${op.position}, ${encodeItemRef(
      op.referenceItem,
    )}, ${JSON.stringify(op.items)})`
  }
  if (op.type === 'replace') {
    return `${styleText('yellow', formattedType)}(${encodeItemRef(op.referenceItem)}, ${JSON.stringify(
      op.items,
    )})`
  }
  if (op.type === 'truncate') {
    return `${styleText('red', formattedType)}(${op.startIndex}, ${op.endIndex})`
  }

  throw new Error(`Invalid operation type: ${(op as {type: string}).type}`)
}

function indent(subject: string, size = 2): string {
  const padding = ' '.repeat(size)

  return subject
    .split('\n')
    .map((line) => padding + line)
    .join('\n')
}
