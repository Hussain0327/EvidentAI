# Getting Started

EvidentAI is a release gate for LLM applications. Use the CLI to run evaluators in CI or locally.

## Install

```bash
npm install -g @evidentai/cli
```

## Configure

```bash
export OPENAI_API_KEY=sk-...
releasegate init
```

## Run

```bash
releasegate run
releasegate run --format junit -o results.xml
releasegate run --retries 3 --retry-delay 1000
```

## Next

See `docs/configuration.md` for config fields and evaluator options.
