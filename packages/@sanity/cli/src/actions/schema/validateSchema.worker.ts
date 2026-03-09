import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {findStudioConfigPath, getStudioWorkspaces} from '@sanity/cli-core'
import {
  type EncodableObject,
  type EncodableValue,
  type SetSynchronization,
} from '@sanity/descriptors'
import {DescriptorConverter} from '@sanity/schema/_internal'
import {
  type Schema,
  type SchemaValidationProblem,
  type SchemaValidationProblemGroup,
} from '@sanity/types'

import {getWorkspace} from '../../util/getWorkspace.js'
import {isSchemaError} from '../../util/isSchemaError.js'
import {type SerializedSchemaDebug, type SerializedTypeDebug} from './types.js'

/** @internal */
export interface ValidateSchemaWorkerData {
  workDir: string

  debugSerialize?: boolean
  level?: SchemaValidationProblem['severity']
  workspace?: string
}

/** @internal */
export interface ValidateSchemaWorkerResult {
  validation: SchemaValidationProblemGroup[]

  serializedDebug?: SerializedSchemaDebug
}

const {
  debugSerialize,
  level = 'warning',
  workDir,
  workspace: workspaceName,
} = workerData as ValidateSchemaWorkerData

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('This module must be run as a worker thread')
  }

  try {
    const configPath = await findStudioConfigPath(workDir)
    const workspaces = await getStudioWorkspaces(configPath)
    const workspace = getWorkspace(workspaces, workspaceName)
    const schema = workspace.schema
    parentPort?.postMessage(await resultFromSchema(schema))
  } catch (err: unknown) {
    if (isSchemaError(err)) {
      parentPort?.postMessage(await resultFromSchema(err.schema))
      return
    }

    throw err
  }
}

async function resultFromSchema(schema: Schema): Promise<ValidateSchemaWorkerResult> {
  let serializedDebug: ValidateSchemaWorkerResult['serializedDebug']

  if (debugSerialize) {
    const conv = new DescriptorConverter()
    const set = await conv.get(schema)
    serializedDebug = getSerializedSchemaDebug(set)
  }

  const validation = schema._validation ?? []

  const result: ValidateSchemaWorkerResult = {
    serializedDebug,
    validation: validation
      .map((group) => ({
        ...group,
        problems: group.problems.filter((problem) =>
          level === 'error' ? problem.severity === 'error' : true,
        ),
      }))
      .filter((group) => group.problems.length),
  }

  return result
}

function getSerializedSchemaDebug(set: SetSynchronization<string>): SerializedSchemaDebug {
  let size = 0
  const types: Record<string, SerializedTypeDebug> = {}
  const hoisted: Record<string, SerializedTypeDebug> = {}

  for (const [id, value] of Object.entries(set.objectValues)) {
    const descType = typeof value.type === 'string' ? value.type : '<unknown>'
    switch (descType) {
      case 'sanity.schema.hoisted': {
        const key = typeof value.key === 'string' ? value.key : id
        // The `hoisted` can technically  hoist _anything_,
        // but we detect the common case of field + array element.
        if (isEncodableObject(value.value) && isEncodableObject(value.value.typeDef)) {
          const debug = getSerializedTypeDebug(value.value.typeDef)
          hoisted[key] = debug
          size += debug.size
        }
        break
      }
      case 'sanity.schema.namedType': {
        const typeName = typeof value.name === 'string' ? value.name : id
        if (isEncodableObject(value.typeDef)) {
          const debug = getSerializedTypeDebug(value.typeDef)
          types[typeName] = debug
          size += debug.size
        }
        break
      }
      default:
    }
    size += JSON.stringify(value).length
  }

  return {
    hoisted,
    size,
    types,
  }
}

function isEncodableObject(val: EncodableValue | undefined): val is EncodableObject {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function getSerializedTypeDebug(typeDef: EncodableObject): SerializedTypeDebug {
  const ext = typeof typeDef.extends === 'string' ? typeDef.extends : '<unknown>'
  let fields: SerializedTypeDebug['fields']
  let of: SerializedTypeDebug['of']

  if (Array.isArray(typeDef.fields)) {
    fields = {}

    for (const field of typeDef.fields) {
      if (!isEncodableObject(field)) continue
      const name = field.name
      const fieldTypeDef = field.typeDef
      if (typeof name !== 'string' || !isEncodableObject(fieldTypeDef)) continue

      fields[name] = getSerializedTypeDebug(fieldTypeDef)
    }
  }

  if (Array.isArray(typeDef.of)) {
    of = {}

    for (const field of typeDef.of) {
      if (!isEncodableObject(field)) continue
      const name = field.name
      const arrayTypeDef = field.typeDef
      if (typeof name !== 'string' || !isEncodableObject(arrayTypeDef)) continue

      of[name] = getSerializedTypeDebug(arrayTypeDef)
    }
  }

  return {
    extends: ext,
    fields,
    of,
    size: JSON.stringify(typeDef).length,
  }
}

await main()
