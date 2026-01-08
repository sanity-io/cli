import {Output} from '@sanity/cli-core'
import semver from 'semver'

import {readPackageJson} from '../../util/readPackageJson.js'
import {VersionedFramework} from './types.js'

interface CheckCompatibilityOptions {
  detectedFramework: VersionedFramework
  output: Output
  outputPath: string
}

export async function checkNextJsReactCompatibility({
  detectedFramework,
  output,
  outputPath,
}: CheckCompatibilityOptions) {
  const packageJson = await readPackageJson(`${outputPath}/package.json`)
  const reactVersion = packageJson?.dependencies?.react

  if (reactVersion) {
    const isUsingReact19 = semver.coerce(reactVersion)?.major === 19
    const isUsingNextJs15 = semver.coerce(detectedFramework?.detectedVersion)?.major === 15

    if (isUsingNextJs15 && isUsingReact19) {
      output.warn('╭────────────────────────────────────────────────────────────╮')
      output.warn('│                                                            │')
      output.warn('│ It looks like you are using Next.js 15 and React 19        │')
      output.warn('│ Please read our compatibility guide.                       │')
      output.warn('│ https://www.sanity.io/help/react-19                        │')
      output.warn('│                                                            │')
      output.warn('╰────────────────────────────────────────────────────────────╯')
    }
  }
}
