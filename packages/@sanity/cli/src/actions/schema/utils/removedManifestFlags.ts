import {Flags} from '@oclif/core'
import {type Output} from '@sanity/cli-core'

/**
 * `--extract-manifest` / `--no-extract-manifest` and `--manifest-dir` used to control reading and
 * regenerating a manifest file on disk. `schemas deploy`, `list`, and `delete` stopped using a
 * manifest when they moved to reading the schema from the live workspace (#390, #406, #473), so the
 * flags no longer do anything.
 *
 * They are kept here — hidden, with no default so we can tell whether they were actually passed —
 * to avoid an unknown-flag error for scripts still passing them. {@link warnOnRemovedManifestFlags}
 * emits a warning when they are, and they will be removed in a future release.
 */
export const removedManifestFlags = {
  'extract-manifest': Flags.boolean({
    allowNo: true,
    description: 'No longer has any effect; schemas are read from the live workspace',
    hidden: true,
  }),
  'manifest-dir': Flags.directory({
    description: 'No longer has any effect; schemas are read from the live workspace',
    hidden: true,
  }),
}

/**
 * Warn when any of the removed manifest flags were passed. The flags are accepted but ignored, so
 * this tells the user why nothing changed and that they can drop them.
 */
export function warnOnRemovedManifestFlags(
  flags: {'extract-manifest'?: boolean; 'manifest-dir'?: string},
  output: Pick<Output, 'warn'>,
): void {
  const passed: string[] = []
  if (flags['extract-manifest'] !== undefined) {
    passed.push(flags['extract-manifest'] ? '--extract-manifest' : '--no-extract-manifest')
  }
  if (flags['manifest-dir'] !== undefined) {
    passed.push('--manifest-dir')
  }

  if (passed.length === 0) return

  output.warn(
    `${passed.join(' and ')} no longer ${passed.length === 1 ? 'has' : 'have'} any effect and will be removed in a future release. Schemas are read from the live workspace, not a manifest file.`,
  )
}
