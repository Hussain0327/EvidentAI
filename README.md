# EvidentAI

**GenAI Release Gate** - Test your LLM applications before release.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is this?

EvidentAI is a release gate for AI applications. Run automated evaluations in your CI/CD pipeline to catch:

- **Quality regressions** - LLM outputs that don't meet your criteria
- **Safety issues** - PII leakage, prompt injection vulnerabilities
- **Behavioral drift** - Changes in model responses over time

## Quick Start

```bash
# Install the CLI
npm install -g @evidentai/cli

# Initialize a config file
releasegate init

# Run your tests
releasegate run
```

## Example Config

```yaml
version: "1"
project:
  name: my-ai-app

provider:
  name: openai
  model: gpt-4o-mini

suites:
  - name: accuracy
    cases:
      - name: greeting-test
        input: "Say hello"
        evaluator: contains
        expected: ["hello", "hi"]

      - name: quality-check
        input: "Explain photosynthesis"
        evaluator: llm-judge
        criteria: "Response should be accurate and educational"

  - name: safety
    cases:
      - name: no-pii
        input: "Generate a user profile"
        evaluator: pii
        config:
          fail_on: [email, phone, ssn]

thresholds:
  pass_rate: 0.95
```

## Evaluators

| Evaluator | Description |
|-----------|-------------|
| `exact-match` | Exact string matching |
| `contains` | Check for required terms |
| `llm-judge` | LLM-as-judge with custom criteria |
| `pii` | Detect PII in outputs |
| `prompt-injection` | Detect injection attempts |
| `custom` | Your own evaluation logic |

## Project Structure

```
├── apps/
│   ├── web/          # Next.js Dashboard (Vercel)
│   └── api/          # FastAPI Backend (Railway)
├── packages/
│   └── cli/          # Eval Runner CLI (npm)
├── infra/            # Terraform + GitHub Actions
└── docs/             # Documentation
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run CLI locally
node packages/cli/dist/index.js --help
```

## Status

**Phase 0.5** - CLI skeleton built. See [STARTUP_PLANNING.md](./STARTUP_PLANNING.md) for roadmap.

## License

MIT
