/**
 * What a {@link GeneratedArtifact.source} builder receives from the build — the
 * one thing it can't compute on its own, since only the build knows where the
 * runtime dir sits relative to the app's `src`.
 */
interface ArtifactContext {
  /** Import specifier for an app `src` file, relative to this artifact. */
  resolveImport: (src: string) => string
}

/**
 * One file the federation build generates into the runtime dir for a declared
 * interface. Each interface type — views, services — expands its declarations
 * into a flat list of these; the build then writes them and maps the ones the
 * host loads directly into the module-federation manifest.
 *
 * Adding an interface type is adding a builder that returns
 * `GeneratedArtifact[]` — the write loop and the expose mapping never change.
 */
export interface GeneratedArtifact {
  /** Path relative to the federation runtime dir, e.g. `views/feed/panel.js`. */
  path: string
  /** Build the file's contents. */
  source: (context: ArtifactContext) => string

  /**
   * Module-federation expose key when the host loads this artifact directly —
   * a view component `./views/feed/panel`, a service loader `./services/unread`.
   * Omitted for a file the host never loads on its own, like a worker bundle
   * (reached through its sibling loader).
   */
  expose?: string
}

/**
 * Map the artifacts the host loads directly (those with an `expose`) to their
 * runtime-dir paths, for the module-federation `exposes` field. `toExposePath`
 * turns a runtime-relative artifact path into the value federation wants — the
 * caller owns the runtime-dir location and any entry resolution.
 */
export function artifactExposes(
  artifacts: readonly GeneratedArtifact[],
  toExposePath: (artifactPath: string) => string,
): Record<string, string> {
  const exposes: Record<string, string> = {}
  for (const artifact of artifacts) {
    if (artifact.expose) {
      exposes[artifact.expose] = toExposePath(artifact.path)
    }
  }
  return exposes
}
