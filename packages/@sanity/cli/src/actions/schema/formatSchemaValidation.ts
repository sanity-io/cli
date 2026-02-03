import {isatty} from 'node:tty'
import {styleText} from 'node:util'

import {logSymbols} from '@sanity/cli-core/ux'
import {type SchemaValidationProblemGroup, type SchemaValidationProblemPath} from '@sanity/types'

const isTty = isatty(1)

const headers = {
  error: isTty ? styleText(['bold', 'bgRed', 'black'], ' ERROR ') : styleText('red', '[ERROR]'),
  warning: isTty
    ? styleText(['bold', 'bgYellow', 'black'], ' WARN ')
    : styleText('yellow', '[WARN]'),
}

const severityValues = {error: 0, warning: 1}

function formatPath(pathSegments: SchemaValidationProblemPath) {
  const format = (
    [curr, ...next]: SchemaValidationProblemPath,
    mode: 'array' | 'object' = 'object',
  ): string => {
    if (!curr) return ''
    if (curr.kind === 'property') return format(next, curr.name === 'of' ? 'array' : 'object')

    const name = curr.name || `<anonymous_${curr.type}>`
    return `${mode === 'array' ? `[${name}]` : `.${name}`}${format(next)}`
  }

  return format(pathSegments.slice(1)).slice(1) // removes the top-level type and leading `.`
}

export function getAggregatedSeverity(
  groupOrGroups: SchemaValidationProblemGroup | SchemaValidationProblemGroup[],
): 'error' | 'warning' {
  const groups = Array.isArray(groupOrGroups) ? groupOrGroups : [groupOrGroups]
  return groups
    .flatMap((group) => group.problems.map((problem) => problem.severity))
    .includes('error')
    ? 'error'
    : 'warning'
}

export function formatSchemaValidation(validation: SchemaValidationProblemGroup[]): string {
  let unnamedTopLevelTypeCount = 0
  const validationByTypeMap: Record<string, SchemaValidationProblemGroup[]> = {}

  for (const group of validation) {
    const [firstSegment] = group.path
    if (!firstSegment) continue
    if (firstSegment.kind !== 'type') continue

    const topLevelType =
      firstSegment.name || `<unnamed_${firstSegment.type}_type_${unnamedTopLevelTypeCount++}>`

    if (!validationByTypeMap[topLevelType]) {
      validationByTypeMap[topLevelType] = []
    }

    validationByTypeMap[topLevelType].push(group)
  }

  const validationByType = Object.entries(validationByTypeMap)

  const formatted = validationByType
    .toSorted((a, b) => {
      const [aType, aGroups] = a
      const [bType, bGroups] = b
      const aValue = severityValues[getAggregatedSeverity(aGroups)]
      const bValue = severityValues[getAggregatedSeverity(bGroups)]
      if (aValue === bValue) return aType.localeCompare(bType, 'en-US')
      return aValue - bValue
    })
    .map(([topLevelType, groups]) => {
      const formattedTopLevelType = isTty
        ? styleText(['bgWhite', 'black'], ` ${topLevelType} `)
        : `[${topLevelType}]`

      const header = `${headers[getAggregatedSeverity(groups)]} ${formattedTopLevelType}`
      const body = groups
        .toSorted(
          (a, b) =>
            severityValues[getAggregatedSeverity(a)] - severityValues[getAggregatedSeverity(b)],
        )
        .map((group) => {
          const formattedPath = `  ${styleText('bold', formatPath(group.path) || '(root)')}`
          const formattedMessages = group.problems
            .toSorted((a, b) => severityValues[a.severity] - severityValues[b.severity])
            .map(({message, severity}) => `    ${logSymbols[severity]} ${message}`)
            .join('\n')

          return `${formattedPath}\n${formattedMessages}`
        })
        .join('\n')

      return `${header}\n${body}`
    })
    .join('\n\n')

  return formatted
}
