// Simulates what libraries like styled-components do: reference browser globals
// (e.g. `Element`, `HTMLElement`) at import time. This ensures our browser
// environment stubs provide these globals in worker threads.
// Look ma, browser globals at import time 🙈

// Direct references — these throw ReferenceError if the globals are missing,
// which is exactly what happens with styled-components accessing `Element`.
const _Element = Element
const _HTMLElement = HTMLElement
const _Node = Node

void _Element
void _HTMLElement
void _Node
