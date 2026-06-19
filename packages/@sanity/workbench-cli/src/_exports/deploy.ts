// Node-only deploy entry: the workbench-app accessor with the deploy-time guards
// (`assertDeployable`, `checkBuiltOutput`) the deploy command runs before
// shipping. Built on the same shared resolver as the build accessor.
export {getWorkbench} from '../actions/deploy/getWorkbench.js'
