import {MintProjectCommand} from './projects/mint.js'

/**
 * Top-level alias for `sanity projects mint`. Subclassing (rather than oclif's `aliases`) gives
 * `sanity new` its own entry in help output while sharing the entire implementation.
 */
export class NewCommand extends MintProjectCommand {
  // Don't inherit the parent's `project:mint` alias — it must resolve to a single command.
  static override hiddenAliases: string[] = []
}
