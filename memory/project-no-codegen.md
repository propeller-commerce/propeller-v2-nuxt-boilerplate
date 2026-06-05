---
name: project-no-codegen
description: No Mitosis / no codegen — hand-maintained Vue, same posture as the other consumers
metadata:
  type: project
---

**Fact**: This project, like propeller-next and propeller-vue, is
hand-maintained. There is no Mitosis pipeline, no codegen, no generated
output directory. Every `.vue` / `.ts` file under `app/`, `server/`,
`composables/` is real source.

The shared UI surface (`propeller-v2-vue-ui`) is also hand-maintained — see
[[project-package-consumption]].

**Why**: the propeller-* monorepo went through a Mitosis experiment that
was abandoned; the lesson is recorded in propeller-next's memory under
`project-no-mitosis.md`. The three consumer apps committed to keeping
their UI hand-written.

**How to apply**:
- Don't introduce a generator that targets `app/` or `server/`. If a
  pattern is repeated across all three apps, extract it to a package, not
  a code-gen.
- Component edits ALWAYS happen in the `propeller-v2-vue-ui` package repo,
  never under `app/components/` in this project (the consumer
  only owns thin layout wrappers — AppHeader/AppFooter/AccountSidebar).
- Composable edits go in the package too; project-local composables
  (`useTranslations`, `useCatalogListing`) are glue, not domain logic.

Related: [[project-package-consumption]], [[project-architecture]].
