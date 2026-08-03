import {type VendorBuildConfig} from './resolveVendorBuildConfig.js'

/**
 * Everything the production build needs to produce an auto-updating studio/app.
 *
 * Auto-updating deployments load `sanity` (and friends) from Sanity's module
 * CDN via an import map, and load `react`/`react-dom`/`styled-components` from
 * hashed vendor chunks emitted by the build itself. These concerns always come
 * together: when auto-updates are disabled none of this applies and everything
 * is bundled as usual.
 *
 * @internal
 */
export interface AutoUpdatesBuildConfig {
  /** Import map entries for the packages served from Sanity's module CDN. */
  imports: Record<string, string>
  /** Vendor packages to emit as hashed browser-loadable ESM chunks. */
  vendor: VendorBuildConfig

  /** Stylesheets served from the module CDN, loaded via `<link>` tags. */
  cssUrls?: string[]
}
