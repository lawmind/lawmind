# Bootstrap

Before any task:

1. Audit OS, shell, Node, Python, Git, package managers.
2. Verify/install globally if missing:
- Understand-Anything: https://github.com/Lum1104/Understand-Anything
- RTK: **Homebrew only** — `brew install rtk`. Never `cargo install rtk`;
  the crates.io name is a different package and installing it breaks the hook.
- Context Mode: https://github.com/mksglu/context-mode
- Caveman: https://github.com/juliusbrussee/caveman
- agentmemory: episodic layer, serves on :3111
- AFT: https://github.com/ualtinok/aft

Verify installation, configure integrations, build repository indexes, enable
shell interception and context optimization before starting work.

Health checks:
- agentmemory — `pgrep` for the process, then `nc -z localhost 3111`. An HTTP
  probe returns nothing useful; do not use curl to test liveness.
- codebase-memory-mcp — always-on; confirm the hook augments Grep/Glob.
- RTK — `which rtk` must resolve inside the Homebrew prefix.
