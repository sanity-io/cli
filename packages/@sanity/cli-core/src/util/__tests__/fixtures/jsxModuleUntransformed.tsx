/* @jsxRuntime classic */
/* @jsx jsxFactory */

// Minimal JSX typings — this package has no react types, and without an
// IntrinsicElements interface tsc rejects the element below (TS7026).
declare global {
  // required for JSX.IntrinsicElements — there is no module-syntax equivalent
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      div: {children?: unknown; id?: string}
    }
  }
}

// Byte-for-byte sibling of jsxModule.tsx (different path only): the
// without-`jsx` test imports this copy so a transform cached by the
// with-`jsx` test can never satisfy it.
export function jsxFactory(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): {children: unknown[]; props: Record<string, unknown> | null; type: unknown} {
  return {children, props, type}
}

export const element = <div id="jsx-fixture">rendered</div>
