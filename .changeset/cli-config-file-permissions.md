---
'@sanity/cli': patch
'@sanity/cli-core': patch
---

fix(cli-core): make the CLI config file readable by its owner only

Since 6.0.0, the file that stores your CLI login (`~/.config/sanity/config.json`) could be created readable by other users on the same computer. The CLI now creates it readable only by you, and fixes an existing file the next time you run a command. If you use the CLI on a computer shared with other people, you can replace your login token by running `sanity logout` and then `sanity login`.
