import {spinner} from '@sanity/cli-core/ux'
import prettyMs from 'pretty-ms'

interface ProgressEvent {
  step: string

  current?: number
  total?: number
  update?: boolean
}

interface ProgressSpinner {
  fail: () => void
  set: (progress: ProgressEvent) => void
  succeed: () => void
  update: (progress: ProgressEvent) => void
}

export const newProgress = (startStep: string): ProgressSpinner => {
  let spin = spinner(startStep).start()
  let lastProgress: ProgressEvent = {step: startStep}
  let start = Date.now()

  const print = (progress: ProgressEvent) => {
    const elapsed = prettyMs(Date.now() - start)
    spin.text =
      progress.current && progress.current > 0 && progress.total && progress.total > 0
        ? `${progress.step} (${progress.current}/${progress.total}) [${elapsed}]`
        : `${progress.step} [${elapsed}]`
  }

  return {
    fail: () => {
      spin.fail()
      start = Date.now()
    },
    set: (progress: ProgressEvent) => {
      if (progress.step !== lastProgress.step) {
        print(lastProgress) // Print the last progress before moving on
        spin.succeed()
        spin = spinner(progress.step).start()
        start = Date.now()
      } else if (progress.step === lastProgress.step && progress.update) {
        print(progress)
      }
      lastProgress = progress
    },
    succeed: () => {
      spin.succeed()
      start = Date.now()
    },
    update: (progress: ProgressEvent) => {
      print(progress)
      lastProgress = progress
    },
  }
}
