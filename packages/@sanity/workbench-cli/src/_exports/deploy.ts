// Node-only deploy entry. `getWorkbench` is the workbench-app accessor with the
// deploy-time guards that need the app's declarations (`assertDeployable`,
// `buildViewDeploymentPayload`); `checkBuiltOutput` validates a federation build
// on disk and needs no app, so it stands alone.
export {checkBuiltOutput} from '../actions/deploy/checkBuiltOutput.js'
export {getWorkbench} from '../actions/deploy/getWorkbench.js'
