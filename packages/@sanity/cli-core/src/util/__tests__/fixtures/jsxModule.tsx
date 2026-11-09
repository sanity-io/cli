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

// Classic-runtime pragma with a local factory so the fixture evaluates without
// react (or react/jsx-runtime) being installed in this package.
export function jsxFactory(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): {children: unknown[]; props: Record<string, unknown> | null; type: unknown} {
  return {children, props, type}
}

export const element = <div id="jsx-fixture">rendered</div>
