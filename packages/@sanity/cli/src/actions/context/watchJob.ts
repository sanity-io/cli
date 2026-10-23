import {spinner} from '@sanity/cli-core/ux'
import {type Context} from '@sanity/client'

import {waitForJob} from './waitForJob.js'

/**
 * Error message for a job that ended in a non-succeeded terminal state,
 * e.g. "Build failed: <reason>"
 */
export function formatJobFailure(noun: string, job: Context.Job): string {
  return `${noun} ${job.status}${job.error ? `: ${job.error}` : ''}`
}

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
    spin.fail(label)
    throw error
  }

  if (job.status === 'succeeded') {
    spin.succeed(successText ?? label)
  } else {
    spin.fail(label)
  }

  return job
}
