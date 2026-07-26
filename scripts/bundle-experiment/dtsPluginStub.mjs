// Inert stand-in for @module-federation/dts-plugin, aliased in at bundle time
// (see bundle.mjs). It is statically reachable from the workbench build
// pipeline, but the workbench hard-disables dts type generation
// (dts: {generateTypes: false}), so none of these APIs ever execute — shipping
// the real plugin would drag in typescript@7 (~30MB native) for dead code.
export const consumeTypesAPI = () => {}
export const generateTypesAPI = () => {}
export const isTSProject = () => false
export const normalizeConsumeTypesOptions = () => false
export const normalizeDtsOptions = () => false
export const normalizeGenerateTypesOptions = () => false
export const rpc = {}
export default () => []
