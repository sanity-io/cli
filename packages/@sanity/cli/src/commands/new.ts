import {MintProjectCommand} from './projects/mint.js'

/**
 * Top-level alias for `sanity projects mint`.
 * Subclassed to share implementation and give `sanity new` its own entry in help output.
 */
export class NewCommand extends MintProjectCommand {
  // Don't inherit the parent's `project:mint` alias — it must resolve to a single command.
  static override hiddenAliases: string[] = []
}
