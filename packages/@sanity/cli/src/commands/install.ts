import {Args} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {
  installDeclaredPackages,
  installNewPackages,
} from '../util/packageManager/installPackages.js'
import {getPackageManagerChoice} from '../util/packageManager/packageManagerChoice.js'

export class Install extends SanityCommand<typeof Install> {
  static override args = {
    packages: Args.string({
      description: 'Packages to install',
      multiple: true,
      required: false,
    }),
  }

  static override description = 'Installs dependencies for Sanity Studio project'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> @sanity/vision',
    '<%= config.bin %> <%= command.id %> some-package another-package',
  ]

  static strict = false

  public async run(): Promise<void> {
    const {argv} = await this.parse(Install)
    // Oclif doesn't support multiple arguments
    // so we need to parse the arguments manually
    const packages = argv as string[]
    const root = await this.getProjectRoot()
    const workDir = root.directory

    const pkgManager = await getPackageManagerChoice(workDir, {interactive: true})

    await (packages.length > 0
      ? installNewPackages(
          {packageManager: pkgManager.chosen, packages},
          {output: this.output, workDir},
        )
      : installDeclaredPackages(workDir, pkgManager.chosen, {output: this.output, workDir}))
  }
}
