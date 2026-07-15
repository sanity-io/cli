export const FEDERATION_FILE_NAME = 'remote-entry'
export const FEDERATION_DIR_NAME = 'federation'
export const RUNTIME_DIR = `.sanity/${FEDERATION_DIR_NAME}`

// Project-root-relative path of the dts tsconfig, shared so `sanityFederationTypes`
// (writes it) and `sanityModuleFederation` (points type generation at it) can't drift.
export const DTS_TSCONFIG_PATH = `${RUNTIME_DIR}/tsconfig.json`
