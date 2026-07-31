# Coding Standards

- Minimal diffs.
- Preserve existing style.
- No drive-by refactors.
- Avoid unrelated formatting.
- Optimize for readability and maintainability.
- Never edit generated files.

Project additions:
- TypeScript strict everywhere. No `any` without a comment naming why.
- All DB access through Drizzle. Never build SQL by string concatenation.
- Zod-validate every API input at the boundary.
- No money or fee arithmetic in the client. API returns computed values.
