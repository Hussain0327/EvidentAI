# Configuration

ReleaseGate config is a YAML file (default: `releasegate.yaml`). Values support environment interpolation like `${OPENAI_API_KEY}`.

## Minimal Example

```yaml
version: "1"
project:
  name: my-project
provider:
  name: openai
  model: gpt-4o-mini
  api_key: ${OPENAI_API_KEY}
suites:
  - name: basic
    cases:
      - name: greeting
        input: Say hello in a friendly way
        evaluator: contains
        expected: ["hello", "hi"]
```

## Provider Options

```yaml
provider:
  name: openai | anthropic | azure | custom
  model: gpt-4o-mini
  api_key: ${OPENAI_API_KEY}
  temperature: 0.7
  max_tokens: 512
```

Azure requires `endpoint` and `deployment`. Custom providers require `endpoint` and can include `headers`.

## Optional Sections

```yaml
thresholds:
  pass_rate: 0.9
  per_suite:
    safety:
      pass_rate: 1.0

output:
  format: json
  path: ./results/latest.json

upload:
  enabled: true
  api_key: ${RELEASEGATE_API_KEY}
```

See `packages/cli/releasegate.yaml` for a full example.
