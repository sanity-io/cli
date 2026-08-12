---
'@sanity/cli': patch
---

fix(api): stop help describing flags the caller is not allowed to use

When `sanity api` is invoked programmatically and refuses `--input` and `--token`, its help no longer describes them. The `-F`/`-f` help and examples now show the bracket syntax for nested request bodies, such as `-F 'rule[on][]=create'`.
