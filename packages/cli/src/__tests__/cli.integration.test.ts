import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { createProgram } from '../index';

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

describe('CLI integration', () => {
  it('init creates config and validate succeeds', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'releasegate-cli-'));
    const configPath = path.join(tempDir, 'releasegate.yaml');

    try {
      const initResult = await runCli(['init', '--output', configPath]);
      expect(initResult.exitCode).toBe(0);
      expect(fs.existsSync(configPath)).toBe(true);
      expect(initResult.stdout.join('\n')).toContain('Created');

      const parsed = yaml.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(parsed.version).toBe('1');
      expect(parsed.project).toBeTruthy();
      expect(parsed.provider).toBeTruthy();
      expect(Array.isArray(parsed.suites)).toBe(true);

      const validateResult = await runCli(['validate', '--config', configPath]);
      expect(validateResult.exitCode).toBe(0);
      expect(validateResult.stdout.join('\n')).toContain('Configuration is valid');
      expect(validateResult.stderr.length).toBe(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('validate reports schema errors for invalid config', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'releasegate-cli-'));
    const configPath = path.join(tempDir, 'bad-releasegate.yaml');

    try {
      const invalidConfig = [
        "version: '1'",
        'project:',
        '  name: bad-project',
        'provider:',
        '  name: openai',
        '  model: gpt-4o-mini',
        'suites: []',
      ].join('\n');
      fs.writeFileSync(configPath, invalidConfig, 'utf-8');

      const validateResult = await runCli(['validate', '--config', configPath]);
      expect(validateResult.exitCode).toBe(1);
      expect(validateResult.stderr.join('\n')).toContain('Configuration error');
      expect(validateResult.stderr.join('\n')).toContain('Configuration validation failed');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
