import {spinner} from '@sanity/cli-core/ux'
import {type Context} from '@sanity/client'

import {waitForJob} from './waitForJob.js'

/**
 * Watch a knowledge base job with a spinner until it reaches a terminal
 * state, updating the spinner text with the job status on each poll.
 *
 * Fails the spinner and rethrows on polling errors, and fails it when the
 * terminal status is not `succeeded` — turning either outcome into a
 * command error (and exit code) is the caller's responsibility.
 */
export async function watchJob(
  knowledgeBaseId: string,
  jobId: string,
  options: {label: string; successText?: string},
): Promise<Context.Job> {
  const {label, successText} = options
  const spin = spinner(label).start()

  let job: Context.Job
  try {
    job = await waitForJob(knowledgeBaseId, jobId, {
      onPoll: (pending) => {
        spin.text = `${label} (${pending.status})`
      },
    })
  } catch (error) {
    spin.fail()
    throw error
  }

  if (job.status === 'succeeded') {
    spin.succeed(successText)
  } else {
    spin.fail()
  }

  return job
}
