---
'@sanity/cli-build': patch
'@sanity/cli': patch
---

Auto-updating studios now show a notice with a Reload button when the Studio code makes no loading progress for 10 seconds, or is still loading after 30 seconds. The notice never reloads the page itself and disappears once the Studio loads.
