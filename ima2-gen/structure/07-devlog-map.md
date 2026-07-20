---
created: 2026-06-08
tags: [ima2-gen, structure-docs, devlog, roadmap]
---

# Devlog Map

This document maps the `devlog/` folder structure and explains how to navigate planning, in-progress, and completed work.

## Folder Structure

```
devlog/
├── 00_sse-multiplexing-architecture.md   # SSE multiplexing design doc
├── 01_sse-multiplexing-risk-summary.md   # Integrated risk matrix
├── _plan/                                # Active planning and research
├── _fin/                                 # Completed work (archived)
└── _artifacts/                           # Supporting artifacts
```

## Naming Convention

Devlog entries use decade-range numbering within each initiative:

| Range | Purpose |
|-------|---------|
| 00–09 | Research, specs, architecture docs |
| 10–19 | Phase 1 implementation |
| 20–29 | Phase 2 implementation |
| 30–39 | Phase 3 implementation |

Top-level entries (`00_*.md`, `01_*.md`) are cross-cutting architecture documents not scoped to a single issue.

## Active Plans (`_plan/`)

Files in `_plan/` are work-in-progress. They use the format `YYMMDD_<topic>` to aid chronological sorting. Each plan typically maps to a GitHub issue or a standalone initiative.

As of 2026-07-10, `_plan/` holds only genuinely-active units. The authoritative table is
`devlog/_plan/README.md` §현재 Active Lane:

| Unit | Focus |
|------|-------|
| 260515/260516/260517 | Prompt/agent-mode research + follow-up plans |
| 260531/260601 | PR triage reference, video persistence investigations |
| 260605_stabilize-split | 500-line split — Phase 3 backend remainder |
| 260707_gpt56-oidc-devlog-hardening | Windows package-local Codex/OAuth corrective release after v2.0.14 |

Deferred items live in `_plan/_future/` (canvas exports, masked edit, batch
matrix, storyboard planner skill).

## Completed Work (`_fin/`)

When an initiative is fully shipped and merged, its plan folder moves to `_fin/`. Each `_fin/` entry typically contains a `README.md` with a summary, plus phase-specific logs.

### Key Completed Milestones

| Archive | Description |
|---------|-------------|
| `260428_issue33-mobile-overhaul-logs` | Mobile shell redesign |
| `260429_app-weight-reduction` | Code splitting and bundle diet |
| `260429_issue45-cli-feature-parity` | CLI ↔ server API parity |
| `260430_issue24-typescript-strict-cleanup` | TypeScript strict migration |
| `260508_issue60-multimode-incremental-progress` | Multimode per-slot progress |
| `260516_agent-mode-codex-rs-workspace` | Agent Mode implementation |
| `260602_gemini-vertex-api-provider` | Gemini/Vertex provider integration |
| `260604_500-line-split` | Source file ≤500-line enforcement |
| `260621_issue95-generation-request-log` | Generation request log (#95) |
| `260627_preview-deploy-pipeline` | npm preview OIDC publish pipeline |
| `260629_grok-video-15-1080p` | Grok Video 1.5 1080p contract (v2.0.5) |

Snapshot note, 2026-06-28: WP6 docs code-grounding complete — `devlog/_fin/260628_wp6_docs_code_grounding/`; automated line-count refresh + API/CLI contract tests landed on `dev` (`6383fc4`..`183a78a`).

Snapshot note, 2026-07-07: devlog hardening — 6 shipped units and 1 loose doc
moved to `_fin/`, 11 stale `_plan` duplicates of `_fin`/`_future` copies removed
after byte-diff verification, active-lane table rewritten 1:1 against the
folder listing (`devlog/_plan/260707_gpt56-oidc-devlog-hardening/030_wp3`).

Snapshot note, 2026-07-10: GPT-5.6/OIDC hardening shipped at `v2.0.14`, with
signed preview/stable publications and live Luna/Terra `medium` generation.
Archive is deferred because a Windows global update exposed package-local
Codex PATH and `.cmd` execution defects; the corrective release remains active.

## Cross-References

| Document | Relation |
|----------|----------|
| `[[00-structure-hub]]` | Parent hub — reading order and document map |
| `[[05-node-mode]]` | Node mode devlog entries reference graph session changes |
| `[[06-infra-operations]]` | Build/test infra devlog entries |

## How to Use

1. Check `_plan/` for active work before starting a new initiative — there may be prior research.
2. When finishing an initiative, move its `_plan/` entry to `_fin/` with a `README.md` summary.
3. Top-level numbered docs (e.g., `00_*.md`) are persistent architecture references, not initiative-scoped.
