/**
 * @internal
 */
export interface ModuleVersionInfo {
  declared: string
  installed: string | undefined
  isGlobal: boolean
  isPinned: boolean
  latest: string
  name: string
}

export interface ModuleVersionResult extends ModuleVersionInfo {
  needsUpdate: boolean
}
