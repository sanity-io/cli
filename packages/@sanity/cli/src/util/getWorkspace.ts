export function getWorkspace<T extends {name: string}>(workspaces: T[], workspaceName?: string) {
  if (workspaces.length === 0) {
    throw new Error('No workspaces found')
  }

  if (workspaces.length === 1) {
    return workspaces[0]
  }

  if (!workspaceName) {
    throw new Error(
      `Multiple workspaces found. Please specify which workspace to use with "--workspace". Available workspaces: ${workspaces.map((w) => w.name).join(', ')}`,
    )
  }
  const workspace = workspaces.find((w) => w.name === workspaceName)

  if (!workspace) {
    throw new Error(
      `Could not find "${workspaceName}" workspace. Available workspaces: ${workspaces.map((w) => w.name).join(', ')}`,
    )
  }

  return workspace
}
