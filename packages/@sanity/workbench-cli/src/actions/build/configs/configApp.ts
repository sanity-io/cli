import {type WorkbenchExposes} from '../../../resolveWorkbenchApp.js'

/**
 * Whether this build is a Media Library config app — an app whose manifest
 * declares a `config` expose (aspect field definitions the Media Library
 * host loads through Module Federation).
 *
 * The one predicate the shared build code branches on for Media Library
 * behavior (the island-runtime expose, the sui reset strip, fields HMR);
 * everything behind the branch lives under `configs/`. A future second
 * config type gets its own predicate on `exposes.config.appType` rather
 * than widening this one.
 */
export function isMediaLibraryConfigApp(exposes: WorkbenchExposes | undefined): boolean {
  return exposes?.config !== undefined
}
