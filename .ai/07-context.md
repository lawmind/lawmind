# Context Optimization

Use Context Mode before every model invocation.

Use RTK for:
cat, ls, tree, grep, rg, fd, find, head, tail, git diff, git log, pnpm, npm,
cargo, pytest, jest and build logs.

Remove duplication, compress logs, preserve filenames and line numbers, never
expose raw output unless requested.

A command failed → read the tee log RTK printed. Full output is already saved.
Never re-run a command just to see its output again.
