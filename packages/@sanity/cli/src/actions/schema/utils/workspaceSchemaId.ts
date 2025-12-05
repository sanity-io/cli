import {
  type DefaultWorkspaceSchemaId,
  SANITY_WORKSPACE_SCHEMA_ID_PREFIX,
  type WorkspaceSchemaId,
} from '../../manifest/types.js'
import {validForNamesChars, validForNamesPattern} from './schemaStoreValidation.js'

export function getWorkspaceSchemaId(args: {tag?: string; workspaceName: string}) {
  const {tag, workspaceName: rawWorkspaceName} = args

  let workspaceName = rawWorkspaceName
  let idWarning: string | undefined

  // The HTTP API replaces periods with _ in the workspace name, so the CLI should too
  if (!validForNamesPattern.test(workspaceName)) {
    workspaceName = workspaceName.replaceAll(new RegExp(`[^${validForNamesChars}]`, 'g'), '_')
    idWarning = [
      `Workspace "${rawWorkspaceName}" contains characters unsupported by schema _id [${validForNamesChars}], they will be replaced with _.`,
      'This could lead duplicate schema ids: consider renaming your workspace.',
    ].join('\n')
  }

  const safeBaseId: DefaultWorkspaceSchemaId = `${SANITY_WORKSPACE_SCHEMA_ID_PREFIX}.${workspaceName}`
  return {
    idWarning,
    safeBaseId,
    safeTaggedId: `${safeBaseId}${tag ? `.${tag}` : ''}` satisfies WorkspaceSchemaId,
  }
}
