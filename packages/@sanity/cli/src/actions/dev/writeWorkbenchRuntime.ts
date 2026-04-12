import fs from 'node:fs/promises'
import path from 'node:path'

import {devDebug} from './devDebug.js'

const workbenchJsTemplate = `\
// This file is auto-generated on 'sanity dev'
// Modifications to this file are automatically discarded
import {renderWorkbench} from "sanity/workbench"

renderWorkbench(
  document.getElementById("workbench"),
  {organizationId: %SANITY_WORKBENCH_ORGANIZATION_ID%},
  {reactStrictMode: %SANITY_WORKBENCH_REACT_STRICT_MODE%}
)
`

const indexHtml = `\
<!DOCTYPE html>
<!-- This file is auto-generated on 'sanity dev' -->
<!-- Modifications to this file are automatically discarded -->
<html>
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <div id="workbench"></div>
    <script type="module" src="./workbench.js"></script>
  </body>
</html>
`

/**
 * Generates the `.sanity/workbench` directory with static entry files for
 * the workbench Vite dev server.
 *
 * @param cwd - Current working directory (Sanity root dir)
 * @returns The absolute path to the written workbench runtime directory
 * @internal
 */
export async function writeWorkbenchRuntime(options: {
  cwd: string
  organizationId?: string
  reactStrictMode: boolean
}): Promise<string> {
  const {cwd, organizationId, reactStrictMode} = options
  const workbenchDir = path.join(cwd, '.sanity', 'workbench')

  const workbenchJs = workbenchJsTemplate
    .replace(
      /%SANITY_WORKBENCH_ORGANIZATION_ID%/,
      organizationId === undefined ? 'undefined' : JSON.stringify(organizationId),
    )
    .replace(/%SANITY_WORKBENCH_REACT_STRICT_MODE%/, JSON.stringify(reactStrictMode))

  devDebug('Making workbench runtime directory')
  await fs.mkdir(workbenchDir, {recursive: true})

  devDebug('Writing workbench.js to workbench runtime directory')
  await fs.writeFile(path.join(workbenchDir, 'workbench.js'), workbenchJs)

  devDebug('Writing index.html to workbench runtime directory')
  await fs.writeFile(path.join(workbenchDir, 'index.html'), indexHtml)

  return workbenchDir
}
