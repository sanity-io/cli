import {styleText} from 'node:util'

/**
 * Wrap `text` in an OSC 8 terminal hyperlink to `url`. Only emits the escape sequence when
 * stdout is a TTY — piped output (agents, logs) gets the bare text, no escape bytes. Terminals
 * without OSC 8 support ignore the sequence and render the (underlined) text
 * unchanged; `text` may already carry ANSI color styling.
 */
export function hyperlink(text: string, url: string): string {
  return process.stdout.isTTY
    ? `\u001B]8;;${url}\u0007${styleText('underline', text)}\u001B]8;;\u0007`
    : text
}
