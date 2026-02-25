# Tribe v3 Engineering Skills

15 skills enforcing senior-engineer code quality standards. Designed for use with Claude Code as project knowledge files.

## Setup

1. Copy all 15 skill folders into your project's `.claude/skills/` directory (or wherever Claude Code reads skills)
2. Alternatively, upload each `SKILL.md` as project knowledge in Claude.ai
3. Ensure `engineering-standards.md` and `CONVENTIONS.md` are also in project knowledge

## Skills Index

### Group A: Creation-Time Enforcement
| # | Skill | Fires On | Lines |
|---|-------|----------|-------|
| 1 | **code-quality-gate** | Every .ts/.tsx file edit | 81 |
| 2 | **dal-generator** | Any database operation | 112 |
| 3 | **component-scaffolder** | New component or page creation | 165 |
| 4 | **api-route-security** | Any file in app/api/ | 83 |
| 12 | **observability-enforcer** | Async ops, catch blocks, API routes | 122 |
| 13 | **performance-guard** | Queries, lists, useEffect, images | 120 |

### Group B: Commit-Time Enforcement
| # | Skill | Fires On | Lines |
|---|-------|----------|-------|
| 5 | **pre-commit-audit** | Before every git commit | 74 |
| 8 | **i18n-enforcer** | Any user-facing text | 63 |
| 15 | **documentation-protocol** | API routes, pages, architecture decisions | 97 |

### Group C: Workflow Optimization
| # | Skill | Fires On | Lines |
|---|-------|----------|-------|
| 7 | **session-briefing** | Start of coding session | 73 |
| 6 | **debugging-protocol** | Every bug fix | 72 |

### Group D: Specialized Scenarios
| # | Skill | Fires On | Lines |
|---|-------|----------|-------|
| 9 | **error-message-standard** | Error/success/empty state copy | 84 |
| 10 | **capacitor-checker** | Browser APIs, CSS, mobile-specific code | 66 |
| 11 | **migration-protocol** | Schema changes | 77 |
| 14 | **test-scaffolder** | Critical functions in lib/ | 151 |

## Coverage Map

| Engineering Standard | Covered By |
|---------------------|------------|
| 1. Type Safety | code-quality-gate |
| 2. Testing | test-scaffolder |
| 3. Error Handling & Observability | error-message-standard, observability-enforcer |
| 4. API & Data Layer | dal-generator |
| 5. Security | api-route-security |
| 6. Code Organization | code-quality-gate, component-scaffolder |
| 7. Performance | performance-guard |
| 8. Code Review & Quality Gates | pre-commit-audit |
| 9. Documentation | documentation-protocol |
| 10. Deployment & DevOps | migration-protocol |

## Consolidation Plan

Start with all 15 individual skills. After 2-4 weeks of use, consolidate based on friction:
- If multiple skills fire on the same task and add latency → merge them
- If a skill rarely triggers → fold into a related skill
- Target: 4-6 consolidated skills covering the same checks
