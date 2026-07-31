# Verification

Before completion:

- Formatter
- Linter
- Type checker
- Unit tests
- Integration tests (if affected)
- Build verification
- Import validation
- Dependency validation

Do not finalize if verification fails.

Project addition — citation work has one more gate. Any change touching
retrieval, prompts, verification or render must run the citation harness
(`docs/CITATION_HARNESS.md`) and report every metric. A drop below threshold
blocks the change regardless of green tests.
