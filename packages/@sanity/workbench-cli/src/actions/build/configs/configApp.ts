import {type WorkbenchExposes} from '../../../resolveWorkbenchApp.js'

/**
 * Whether this build is a Media Library config app — an app whose manifest
 * declares a `config` expose of `appType: 'media-library'` (aspect field
 * definitions the Media Library host loads through Module Federation).
 *
 * The one predicate the shared build code branches on for Media Library
 * behavior (the island-runtime expose, the sui reset strip, fields HMR);
 * everything behind the branch lives under `configs/`. Keyed on the config's
 * `appType` discriminant, so a future second config type adds its own
 * predicate instead of silently matching this one.
 */
export function isMediaLibraryConfigApp(exposes: WorkbenchExposes | undefined): boolean {
  return exposes?.config?.appType === 'media-library'
}
