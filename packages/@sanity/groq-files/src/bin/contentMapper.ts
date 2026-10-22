// Entry point listed in package.json `typescript.contentMapper.exec`.
// TypeScript 7.1 spawns it with stdio pipes and closes stdin to shut it down.
import {startContentMapper} from '../contentMapper.js'

try {
  await startContentMapper({input: process.stdin, output: process.stdout}).done
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
}
