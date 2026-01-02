/**
 * End-to-End CLI Tests
 *
 * Tests the full `releasegate run` command with various configurations.
 * Integration tests that require API keys are skipped when not available.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createProgram } from '../../index';
import { hasOpenAIKey } from '../helpers';

class ExitError extends Error {
  code: number;

  constructor(code: number) {
    super(`process.exit:${code}`);
    this.code = code;
  }
}

async function runCli(args: string[]): Promise<{
  stdout: string[];
  stderr: string[];
  exitCode: number;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  let exitCode: number | undefined;

  console.log = (...values: unknown[]) => {
    stdout.push(values.map((v) => String(v)).join(' '));
  };
  console.error = (...values: unknown[]) => {
    stderr.push(values.map((v) => String(v)).join(' '));
  };
  process.exit = ((code?: number) => {
    const finalCode = code ?? 0;
    exitCode = finalCode;
    throw new ExitError(finalCode);
  }) as NodeJS.Process['exit'];

  try {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'releasegate', ...args]);
  } catch (error) {
    if (error instanceof ExitError) {
      // Expected for CLI errors that call process.exit
    } else if (error && typeof error === 'object' && 'exitCode' in error) {
      exitCode = Number((error as { exitCode?: number }).exitCode ?? 1);
    } else {
      throw error;
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }

  return {
    stdout,
    stderr,
    exitCode: exitCode ?? 0,
  };
}

describe('CLI E2E Tests', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'releasegate-e2e-'));
    configPath = path.join(tempDir, 'releasegate.yaml');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('Dry Run Mode', () => {
    it('should run in dry-run mode without API calls', async () => {
      const config = `
version: '1'
project:
  name: test-project
  description: Test project for E2E
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic-tests
    cases:
      - name: simple-test
        input: What is 2+2?
        evaluator: exact-match
        expected: '4'
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli(['run', '--config', configPath, '--dry-run']);

      // Dry run should succeed without API key
      expect(result.exitCode).toBe(0);
      expect(result.stdout.join('\n')).toContain('Dry Run');
    });

    it('should show test count in dry-run mode', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: suite1
    cases:
      - name: test1
        input: Hello
        evaluator: contains
        expected:
          - world
      - name: test2
        input: Goodbye
        evaluator: contains
        expected:
          - farewell
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli(['run', '--config', configPath, '--dry-run']);

      expect(result.exitCode).toBe(0);
      // Should mention 2 tests
      const output = result.stdout.join('\n');
      expect(output).toContain('2');
    });
  });

  describe('Output Formats', () => {
    it('should accept format option in dry-run', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: test1
        input: test
        evaluator: exact-match
        expected: test
`;
      fs.writeFileSync(configPath, config);

      // Dry-run mode doesn't produce JSON output (no tests run),
      // but should accept the format option without error
      const result = await runCli([
        'run',
        '--config',
        configPath,
        '--dry-run',
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      // Should show dry run info
      expect(result.stdout.join('\n')).toContain('Dry Run');
    });
  });

  describe('Suite Filtering', () => {
    it('should filter to specific suite', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: suite-a
    cases:
      - name: test-a
        input: A
        evaluator: exact-match
        expected: A
  - name: suite-b
    cases:
      - name: test-b
        input: B
        evaluator: exact-match
        expected: B
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli([
        'run',
        '--config',
        configPath,
        '--dry-run',
        '--suite',
        'suite-a',
      ]);

      expect(result.exitCode).toBe(0);
      const output = result.stdout.join('\n');
      // Should only show suite-a
      expect(output).toContain('suite-a');
    });
  });

  describe('Threshold Configuration', () => {
    it('should use default threshold when not specified', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: test1
        input: test
        evaluator: exact-match
        expected: test
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli(['run', '--config', configPath, '--dry-run']);

      // Should succeed with default threshold
      expect(result.exitCode).toBe(0);
    });

    it('should skip thresholds with --no-thresholds', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: test1
        input: test
        evaluator: exact-match
        expected: test
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli([
        'run',
        '--config',
        configPath,
        '--dry-run',
        '--no-thresholds',
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Configuration Errors', () => {
    it('should fail with missing config file', async () => {
      const result = await runCli([
        'run',
        '--config',
        '/nonexistent/config.yaml',
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toContain('not found');
    });

    it('should fail with invalid YAML', async () => {
      fs.writeFileSync(configPath, 'invalid: yaml: content: [');

      const result = await runCli(['run', '--config', configPath]);

      expect(result.exitCode).toBe(1);
    });

    it('should fail with missing required fields', async () => {
      const config = `
version: '1'
project:
  name: test-project
# Missing provider
suites:
  - name: basic
    cases:
      - name: test1
        input: test
        evaluator: exact-match
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli(['run', '--config', configPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toContain('Configuration');
    });
  });

  describe('Live API Tests', () => {
    // These tests require OPENAI_API_KEY
    const describeWithOpenAI = hasOpenAIKey() ? describe : describe.skip;

    describeWithOpenAI('With OpenAI API', () => {
      it('should execute simple test and return results', async () => {
        const config = `
version: '1'
project:
  name: live-test
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: math-test
        input: What is 1+1? Reply with just the number.
        evaluator: contains
        expected:
          - '2'
`;
        fs.writeFileSync(configPath, config);

        const result = await runCli(['run', '--config', configPath]);

        // Should complete (pass or fail based on model response)
        expect([0, 1]).toContain(result.exitCode);
        const output = result.stdout.join('\n');
        // Should have run the test
        expect(output).toMatch(/math-test|basic/);
      }, 30000); // 30 second timeout for API call

      it('should report pass rate correctly', async () => {
        const config = `
version: '1'
project:
  name: pass-rate-test
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: easy-test
        input: Say the word "hello" and nothing else.
        evaluator: contains
        expected:
          - hello
`;
        fs.writeFileSync(configPath, config);

        const result = await runCli([
          'run',
          '--config',
          configPath,
          '--format',
          'json',
        ]);

        // Find JSON output
        const jsonLine = result.stdout.find((line) => {
          try {
            const parsed = JSON.parse(line);
            return parsed && typeof parsed === 'object' && 'summary' in parsed;
          } catch {
            return false;
          }
        });

        if (jsonLine) {
          const data = JSON.parse(jsonLine);
          expect(data.summary).toBeDefined();
          expect(typeof data.summary.passRate).toBe('number');
        }
      }, 30000);
    });
  });

  describe('Evaluator Configuration', () => {
    it('should support exact-match evaluator config', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: case-insensitive
        input: test
        evaluator: exact-match
        expected: TEST
        config:
          case_sensitive: false
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli(['run', '--config', configPath, '--dry-run']);

      expect(result.exitCode).toBe(0);
    });

    it('should support contains evaluator config', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: match-any
        input: test
        evaluator: contains
        expected:
          - one
          - two
        config:
          match_all: false
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli(['run', '--config', configPath, '--dry-run']);

      expect(result.exitCode).toBe(0);
    });

    it('should support pii evaluator config', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: no-pii
        input: test
        evaluator: pii
        config:
          fail_on:
            - email
            - phone
          redact: true
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli(['run', '--config', configPath, '--dry-run']);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Concurrency', () => {
    it('should accept concurrency option', async () => {
      const config = `
version: '1'
project:
  name: test-project
provider:
  name: openai
  model: gpt-4o-mini
suites:
  - name: basic
    cases:
      - name: test1
        input: test
        evaluator: exact-match
        expected: test
`;
      fs.writeFileSync(configPath, config);

      const result = await runCli([
        'run',
        '--config',
        configPath,
        '--dry-run',
        '--concurrency',
        '5',
      ]);

      expect(result.exitCode).toBe(0);
    });
  });
});
