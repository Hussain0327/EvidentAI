# EvidentAI - Startup Planning

> GenAI Release Gate: Test your LLM applications before release.

## Vision

EvidentAI provides a "release gate" for AI applications - automated evaluation that runs in CI/CD to catch regressions, safety issues, and quality problems before they reach production.

**Target Users**: AI/ML Engineers, Platform Teams, DevOps teams shipping LLM-powered features.

**Core Value Prop**: "Don't ship broken AI. Run `releasegate run` in your CI pipeline."

---

## Current Status: Phase 0.5 (CLI Skeleton)

**Date**: January 1, 2026

### What's Built

| Component | Status | Notes |
|-----------|--------|-------|
| CLI Commands | ✅ Working | `init`, `validate`, `run --dry-run` |
| Config Schema | ✅ Working | Zod validation, YAML parsing |
| Evaluators (code) | ⚠️ Untested | 6 evaluators written, need real LLM testing |
| Provider Integrations | ⚠️ Untested | OpenAI, Anthropic, Azure - code exists |
| Web Dashboard | ❌ Not started | Next.js app structure only |
| API Backend | ❌ Not started | FastAPI structure only |
| Cloud Upload | ❌ Not started | CLI has placeholder |

### What Works Today

```bash
cd packages/cli
node dist/index.js init          # Creates releasegate.yaml
node dist/index.js validate      # Validates config
node dist/index.js run --dry-run # Shows what would run
```

### What Doesn't Work Yet

```bash
node dist/index.js run           # Needs OPENAI_API_KEY + real testing
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         EvidentAI                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │   CLI        │────▶│   API        │────▶│   Dashboard  │     │
│  │ (npm pkg)    │     │ (FastAPI)    │     │  (Next.js)   │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │  Evaluators  │     │  Supabase    │     │   Stripe     │     │
│  │  - LLM Judge │     │  (Database)  │     │  (Billing)   │     │
│  │  - PII       │     └──────────────┘     └──────────────┘     │
│  │  - Injection │                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Roadmap

### Phase 1: CLI MVP (Next Session)
**Goal**: CLI that actually runs tests against real LLMs

- [ ] Test evaluators with real OpenAI API calls
- [ ] Fix any bugs found during real testing
- [ ] Add integration tests
- [ ] Enable TypeScript declaration files (DTS)
- [ ] Publish to npm as `@evidentai/cli`

### Phase 2: Dashboard MVP
**Goal**: Web UI to view test results

- [ ] Build API endpoints for run uploads
- [ ] Create dashboard pages (projects, runs, suites)
- [ ] Implement Supabase auth
- [ ] Deploy to Vercel + Railway

### Phase 3: CI/CD Integration
**Goal**: GitHub Action for automated testing

- [ ] Create `evidentai/release-gate-action`
- [ ] PR comments with results
- [ ] Status checks integration
- [ ] Slack/Discord notifications

### Phase 4: Enterprise Features
**Goal**: Team features and billing

- [ ] Multi-tenant projects
- [ ] Team management
- [ ] Stripe billing integration
- [ ] Usage analytics

---

## Technical Decisions Made

### CLI Stack
- **TypeScript** - Type safety
- **Commander.js** - CLI framework
- **Zod** - Schema validation
- **YAML** - Config format
- **tsup** - Bundling

### Evaluator Strategy
1. **Exact Match / Contains** - Deterministic, fast
2. **LLM-as-Judge** - Uses G-Eval approach with CoT
3. **PII Detection** - Regex patterns (Presidio-inspired)
4. **Prompt Injection** - Multi-layer (heuristic + canary + LLM)
5. **Custom** - User scripts for extensibility

### Provider Support
- OpenAI (primary)
- Anthropic (Claude)
- Azure OpenAI
- Custom endpoints (BYO model)

---

## Files Created Today

### Core CLI Implementation
```
packages/cli/src/
├── index.ts                    # Main CLI entry point
├── commands/
│   └── run.ts                  # Run command with formatters
├── config/
│   ├── types.ts                # TypeScript types
│   ├── schema.ts               # Zod validation schemas
│   └── loader.ts               # YAML loading + env vars
└── runner/
    ├── executor.ts             # Test orchestration
    └── evaluators/
        ├── index.ts            # Evaluator registry
        ├── exact-match.ts      # String matching
        ├── contains.ts         # Term matching
        ├── llm-judge.ts        # LLM-as-judge (G-Eval)
        ├── pii-detector.ts     # PII detection
        ├── prompt-injection.ts # Injection detection
        └── custom.ts           # Custom evaluators
```

---

## Known Issues / Tech Debt

1. **DTS generation disabled** - TypeScript declarations not built (type errors)
2. **No real LLM testing** - All evaluators written but not tested with real APIs
3. **Provider implementations untested** - OpenAI/Anthropic code exists but not validated
4. **No error recovery** - Need retry logic, graceful degradation
5. **No telemetry** - Can't track CLI usage yet

---

## Next Session Priorities

1. **Set up OpenAI API key and test real execution**
2. **Fix any bugs found during real testing**
3. **Add integration tests for evaluators**
4. **Enable DTS and fix type errors**
5. **Start on API backend for result uploads**

---

## Resources

- [G-Eval Paper](https://arxiv.org/abs/2303.16634) - LLM-as-Judge approach
- [Rebuff](https://github.com/protectai/rebuff) - Prompt injection detection
- [Presidio](https://github.com/microsoft/presidio) - PII detection patterns

---

*Last Updated: January 1, 2026*
