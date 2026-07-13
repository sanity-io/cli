---
'@sanity/cli': patch
---

Make dataset create, copy, delete, import, export, and backup commands safe to run unattended by using deterministic output paths and returning actionable usage errors instead of prompting for required input or overwrite confirmation.
