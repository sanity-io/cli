// Stub module - these packages are pulled in through barrel imports
// but never actually used by the init flow at runtime.
export default {}

// Named exports that may be imported but will throw if actually called
export const createJiti = () => {
  throw new Error('jiti is not available in standalone create-sanity')
}

export const JSDOM = class JSDOM {
  constructor() {
    throw new Error('jsdom is not available in standalone create-sanity')
  }
}
