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

## Removing a dependency

**A package with no direct import may still be a declared peer. Check
`peerDependencies` before removing anything.**

Learned in S0, from a near miss. `react-native-svg` had zero `import` sites and
was cut as dead weight during a ponytail pass. It is a **declared peer of
`lucide-react-native`**, which draws every icon in the app — it survived only as
a transitive install, so the icons kept working by luck rather than by
declaration. One unrelated `npm install` would have flattened the tree and taken
them out.

Two rules fall out of it:

1. Before `npm uninstall <pkg>`, run
   `npm ls <pkg>` and grep the `peerDependencies` of everything that depends on
   it. Zero import sites is necessary evidence, not sufficient.
2. **A green build is not proof the cut was safe.** The bundle built fine with
   `react-native-svg` resolved transitively. Ask what the check actually
   observed: a passing `expo export` says the module resolved *today*, not that
   it is correctly declared.

The same pass also cut `react-native-gesture-handler` on the same reasoning. That
one is worse, because its failure mode is a broken swipe-back gesture that no
check available in this environment can see. **Where a cut can only be verified
on a device you do not have, do not make the cut** — leave it and say why.
