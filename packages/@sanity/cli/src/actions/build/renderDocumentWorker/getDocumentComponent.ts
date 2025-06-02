import path from 'node:path'
import {type MessagePort} from 'node:worker_threads'

import {buildDebug} from '../buildDebug.js'
import {BasicDocument} from './components/BasicDocument.jsx'
import {DefaultDocument} from './components/DefaultDocument.jsx'
import {tryLoadDocumentComponent} from './tryLoadDocumentComponent.js'

/**
 * @internal
 */
export async function getDocumentComponent(
  parent: MessagePort,
  studioRootPath: string,
  isApp?: boolean,
) {
  buildDebug('Loading default document component from `sanity` module')

  const Document = isApp ? BasicDocument : DefaultDocument

  buildDebug('Attempting to load user-defined document component from %s', studioRootPath)
  const userDefined = await tryLoadDocumentComponent(studioRootPath)

  if (!userDefined) {
    buildDebug('Using default document component')
    return Document
  }

  buildDebug('Found user defined document component at %s', userDefined.path)

  const DocumentComp = userDefined.component.default || userDefined.component // CommonJS
  if (typeof DocumentComp === 'function') {
    buildDebug('User defined document component is a function, assuming valid')
    return DocumentComp
  }

  buildDebug('User defined document component did not have a default export')
  const userExports = Object.keys(userDefined.component).join(', ') || 'None'
  const relativePath = path.relative(process.cwd(), userDefined.path)
  const typeHint =
    userDefined.component.default === undefined
      ? ''
      : ` (type was ${typeof userDefined.component.default})`

  const warnKey = `${relativePath}/${userDefined.modified}`

  parent.postMessage({
    message: [
      `${relativePath} did not have a default export that is a React component${typeHint}`,
      `Named exports/properties found: ${userExports}`.trim(),
      `Using default document component from "sanity".`,
    ],
    type: 'warning',
    warnKey,
  })

  return DefaultDocument
}
