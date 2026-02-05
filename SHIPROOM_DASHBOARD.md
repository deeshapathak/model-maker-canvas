# SHIPROOM_DASHBOARD

## Scope
- Fix critical and high-priority issues to ship a working iOS app overnight (issues 1–6).

## Agent Team & Ownership
| Role                         | Label                  |
|------------------------------|------------------------|
| Build Sheriff                | build-sheriff          |
| iOS App Architect            | ios-architect          |
| 3D Pipeline Lead             | pipeline-lead          |
| Rendering / Metal Specialist | metal-specialist       |
| API / Network Integrator     | network-integrator     |
| QA Engineer                  | qa-engineer            |
| Release Engineer             | release-engineer       |

## Workflows
- **Workflow 0 (Setup):** Create dashboard & templates, lock scope
- **Workflow 1 (Build):** Clean build & deployment target
- **Workflow 2 (Crashes):** Force-unwrap fixes & safe error handling
- **Workflow 3 (3D Pipeline):** PLY validity & pose logic
- **Workflow 4 (Network):** Timeout race, retry, config
- **Workflow 5 (QA):** Acceptance checklist & regression tests
- **Workflow 6 (Release):** Morning handoff & changelog
