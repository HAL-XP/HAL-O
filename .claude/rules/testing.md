---
description: Testing requirements for all code changes
alwaysApply: true
---
- Run npx tsc --noEmit after every code change
- Smoke test: npx playwright test e2e/smoke.spec.ts
- Visual changes require screenshot verification before presenting
- Never self-validate visual work — spawn a QA agent
- Multi-instance changes: run e2e/isolation-test.spec.ts
- Before telling user "it works": test end-to-end
