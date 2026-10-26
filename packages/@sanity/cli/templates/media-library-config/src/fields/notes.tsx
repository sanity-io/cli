import {Stack, Text, TextArea} from '@sanity/ui'
import type {ChangeEvent, Ref} from 'react'
import {type InputProps, defineField, set, unset} from 'sanity'

/**
 * A custom input component. It renders as an *island*: an isolated React
 * root using this app's own bundled `react` and `@sanity/ui` copies, so
 * there is no version coupling with the Media Library host.
 *
 * Rules that keep an input working inside the island:
 *
 * - Call `onChange` with plain patches (`set(...)` / `unset()`), never
 *   `PatchEvent.from(...)` — patches cross the island boundary as plain
 *   data, and a PatchEvent instance from this bundle's `sanity` copy fails
 *   the host's checks.
 * - Wire `elementProps.id` and `elementProps.ref` onto the focusable
 *   control, so host-driven focus (validation links, presence) reaches it.
 * - Only import the supported `sanity` surface (enforced by the override in
 *   `eslint.config.mjs`); other exports have no provider inside the island
 *   and fail at runtime with the field-failure card.
 * - Keep the module loadable under plain Node.js (field definitions are
 *   evaluated outside the browser when the config is synchronized):
 *   browser-only libraries must be imported lazily from a component module.
 */
function NotesInput(props: InputProps) {
  const {value, onChange, elementProps} = props
  const text = typeof value === 'string' ? value : ''

  return (
    <Stack space={2}>
      <TextArea
        id={elementProps?.id}
        ref={elementProps?.ref as Ref<HTMLTextAreaElement>}
        value={text}
        rows={4}
        placeholder="Add notes..."
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          const next = event.currentTarget.value
          onChange(next ? set(next) : unset())
        }}
      />
      <Text size={1} muted>
        {text.length} characters
      </Text>
    </Stack>
  )
}

export default defineField({
  name: 'notes',
  title: 'Notes',
  type: 'text',
  components: {input: NotesInput},
})
