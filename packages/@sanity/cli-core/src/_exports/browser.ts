// Isolating this to its owns export as it is an expensive utility by way of JSDOM (46MB)
// Should be deprecated/removed after SDK-983 and the below gets moved to @sanity/cli
export {mockBrowserEnvironment} from '../util/environment/mockBrowserEnvironment.js'
