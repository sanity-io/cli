import {logSymbols} from '@sanity/cli-core/ux'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {describe, expect, it, vi} from 'vitest'

import {formatSchemaValidation} from '../formatSchemaValidation'

// disables some terminal specific things that are typically auto detected
vi.mock('node:tty', () => ({isatty: () => false}))

describe('formatSchemaValidation', () => {
  it('formats incoming validation results', () => {
    const validation: SchemaValidationProblemGroup[] = [
      {
        path: [
          {kind: 'type', name: 'arraysTest', type: 'document'},
          {kind: 'property', name: 'fields'},
          {kind: 'type', name: 'imageArray', type: 'array'},
          {kind: 'property', name: 'of'},
          {kind: 'type', type: 'image'},
          {kind: 'property', name: 'fields'},
          {kind: 'type', name: '<unnamed_type_@_index_1>', type: 'string'},
        ],
        problems: [
          {
            helpId: 'schema-object-fields-invalid',
            message: 'Missing field name',
            severity: 'error',
          },
        ],
      },
      {
        path: [
          {kind: 'type', name: 'blocksTest', type: 'document'},
          {kind: 'property', name: 'fields'},
          {kind: 'type', name: '<unnamed_type_@_index_1>', type: 'string'},
        ],
        problems: [
          {
            helpId: 'schema-object-fields-invalid',
            message: 'Missing field name',
            severity: 'error',
          },
          {
            helpId: 'schema-type-missing-name-or-type',
            message: 'Type is missing a type.',
            severity: 'error',
          },
        ],
      },
      {
        path: [
          {kind: 'type', name: 'blocksTest', type: 'document'},
          {kind: 'property', name: 'fields'},
          {kind: 'type', name: 'defaults', type: 'array'},
        ],
        problems: [
          {
            helpId: 'schema-array-of-type-global-type-conflict',
            message:
              'Found array member declaration with the same name as the global schema type "objectWithNestedArray". It\'s recommended to use a unique name to avoid possibly incompatible data types that shares the same name.',
            severity: 'warning',
          },
        ],
      },
      {
        path: [
          {kind: 'type', name: 'pt_customMarkersTest', type: 'document'},
          {kind: 'property', name: 'fields'},
          {kind: 'type', name: 'content', type: 'array'},
          {kind: 'property', name: 'of'},
          {kind: 'type', name: 'block', type: 'block'},
        ],
        problems: [
          {
            helpId: 'schema-deprecated-blockeditor-key',
            message:
              'Decorator "boost" has deprecated key "blockEditor", please refer to the documentation on how to configure the block type for version 3.',
            severity: 'warning',
          },
          {
            helpId: 'schema-deprecated-blockeditor-key',
            message:
              'Annotation has deprecated key "blockEditor", please refer to the documentation on how to configure the block type for version 3.',
            severity: 'warning',
          },
          {
            helpId: 'schema-deprecated-blockeditor-key',
            message:
              'Style has deprecated key "blockEditor", please refer to the documentation on how to configure the block type for version 3.',
            severity: 'warning',
          },
        ],
      },
    ]

    expect(formatSchemaValidation(validation)).toBe(
      `
[ERROR] [arraysTest]
  imageArray[<anonymous_image>].<unnamed_type_@_index_1>
    ${logSymbols.error} Missing field name
      See https://www.sanity.io/docs/help/schema-object-fields-invalid

[ERROR] [blocksTest]
  <unnamed_type_@_index_1>
    ${logSymbols.error} Missing field name
      See https://www.sanity.io/docs/help/schema-object-fields-invalid
    ${logSymbols.error} Type is missing a type.
      See https://www.sanity.io/docs/help/schema-type-missing-name-or-type
  defaults
    ${logSymbols.warning} Found array member declaration with the same name as the global schema type "objectWithNestedArray". It's recommended to use a unique name to avoid possibly incompatible data types that shares the same name.
      See https://www.sanity.io/docs/help/schema-array-of-type-global-type-conflict

[WARN] [pt_customMarkersTest]
  content[block]
    ${logSymbols.warning} Decorator "boost" has deprecated key "blockEditor", please refer to the documentation on how to configure the block type for version 3.
      See https://www.sanity.io/docs/help/schema-deprecated-blockeditor-key
    ${logSymbols.warning} Annotation has deprecated key "blockEditor", please refer to the documentation on how to configure the block type for version 3.
      See https://www.sanity.io/docs/help/schema-deprecated-blockeditor-key
    ${logSymbols.warning} Style has deprecated key "blockEditor", please refer to the documentation on how to configure the block type for version 3.
      See https://www.sanity.io/docs/help/schema-deprecated-blockeditor-key
`.trim(),
    )
  })
})
