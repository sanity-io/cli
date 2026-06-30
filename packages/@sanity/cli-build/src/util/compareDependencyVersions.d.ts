export interface CompareDependencyVersions {
  installed: string
  pkg: string
  remote: string
}

export interface UnresolvedPrerelease {
  pkg: string
  version: string
}

export interface CompareDependencyVersionsResult {
  mismatched: Array<CompareDependencyVersions>
  unresolvedPrerelease: Array<UnresolvedPrerelease>
}
