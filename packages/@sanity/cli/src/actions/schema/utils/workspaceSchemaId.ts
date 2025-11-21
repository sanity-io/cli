import {
  SANITY_WORKSPACE_SCHEMA_TYPE,
  type WorkspaceSchemaId,
} from '../../../manifest/manifestTypes.js'
import {validForIdChars, validForIdPattern} from './schemaStoreValidation.js'

export function getWorkspaceSchemaId(args: {idPrefix?: string; workspaceName: string}) {
  const {idPrefix, workspaceName: rawWorkspaceName} = args

  let workspaceName = rawWorkspaceName
  let idWarning: string | undefined

  if (!validForIdPattern.test(workspaceName)) {
    workspaceName = workspaceName.replaceAll(new RegExp(`[^${validForIdChars}]`, 'g'), '_')
    idWarning = [
      `Workspace "${rawWorkspaceName}" contains characters unsupported by schema _id [${validForIdChars}], they will be replaced with _.`,
      'This could lead duplicate schema ids: consider renaming your workspace.',
    ].join('\n')
  }
  return {
    idWarning,
    safeId:
      `${idPrefix ? (`${idPrefix}.` as const) : ''}${SANITY_WORKSPACE_SCHEMA_TYPE}.${workspaceName}` satisfies WorkspaceSchemaId,
  }
}
