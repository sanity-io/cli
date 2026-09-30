import {rename, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

/** Preserve the plugin's command guard before importing its engine and SDK. */
export async function prepareWorkflowHooks(output: string) {
  for (const event of ['prerun', 'finally']) {
    const hook = join(
      output,
      'dist/node_modules/@sanity/workflow-cli/dist/hooks',
      event,
      'telemetry.js',
    )
    await rename(hook, hook.replace('.js', '.implementation.js'))
    await writeFile(
      hook,
      `import {shouldRunWorkflowCliTelemetry} from '../../command-ids.js';
import {doImport} from '@sanity/cli-core/util';
export default async function(options) {
  if (!shouldRunWorkflowCliTelemetry({bin: options.config.bin, commandId: options.Command?.id})) return;
  const {default: hook} = await doImport(new URL('telemetry.implementation.js', import.meta.url).href);
  return hook.call(this, options);
}
`,
    )
  }
}
