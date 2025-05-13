import {readFile} from 'node:fs/promises'

import {z} from 'zod'

/**
 * Feel free to add properties to this,
 * 🟠ℹ️   BUT ENSURE OPTIONAL STUFF IS ACTUALLY OPTIONAL  ℹ️🟠
 * 🟠ℹ️ SINCE THIS IS USED IN A NUMBER OF LOCATIONS WHERE ℹ️🟠
 * 🟠ℹ️ WE CANNOT ENFORCE/GUARANTEE ANY PARTICULAR PROPS  ℹ️🟠
 */
const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),

  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
})

/**
 * Minimal representation of a package.json.
 *
 * @internal
 */
export type PackageJson = z.infer<typeof packageJsonSchema>

/**
 * Read the `package.json` file at the given path
 *
 * @param filePath - Path to package.json to read
 * @returns The parsed package.json
 * @internal
 */
export async function readPackageJson(filePath: string): Promise<PackageJson> {
  let pkg: unknown
  try {
    pkg = JSON.parse(await readFile(filePath, 'utf8'))
  } catch (err: unknown) {
    throw new Error(`Failed to read "${filePath}"`, {cause: err})
  }

  const {data, error, success} = packageJsonSchema.safeParse(pkg)
  if (success) {
    return data
  }

  throw new Error(
    `Invalid package.json at "${filePath}": ${error.errors.map((err) => err.message).join('\n')}`,
  )
}
