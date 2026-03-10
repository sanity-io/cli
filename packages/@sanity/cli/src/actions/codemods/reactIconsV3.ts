import semver from 'semver'

import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {type CodeMod} from './types.js'

const purpose = 'Transform react-icons v2 imports to v3 form'
const description = `
Modifies all found react-icons import and require statements from their v2 form
to the path structure used in react-icons v3. For instance:

from: import {MdPerson} from 'react-icons/lib/md'
  to: import {MdPerson} from 'react-icons/md'

from: import PersonIcon from 'react-icons/lib/md/person'
  to: import {MdPerson as PersonIcon} from 'react-icons/md'
`.trim()

export const reactIconsV3: CodeMod = {
  description,
  filename: 'reactIconsV3.js',
  purpose,
  verify: async (context) => {
    const {workDir} = context

    const dependencyVersion = await getLocalPackageVersion('react-icons', workDir)
    if (!dependencyVersion) {
      throw new Error('Could not find react-icons declared as dependency in package.json')
    }

    if (semver.compare(dependencyVersion, '3.0.0') < 0) {
      throw new Error('react-icons declared in package.json dependencies is lower than 3.0.0')
    }
  },
}
