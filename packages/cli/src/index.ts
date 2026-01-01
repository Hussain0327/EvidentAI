#!/usr/bin/env node
/**
 * ReleaseGate CLI
 *
 * The GenAI Release Gate - Test your LLM applications before release.
 *
 * Commands:
 *   run     Execute test suites
 *   init    Initialize a new config file
 *   validate  Validate config without running
 *
 * Usage:
 *   releasegate run -c releasegate.yaml
 *   releasegate init
 *   releasegate validate
 */

import { Command } from 'commander';
import { createRunCommand } from './commands/run';
import { generateSampleConfig } from './config/loader';
import { loadConfig } from './config/loader';
import * as fs from 'fs';
import * as path from 'path';

// Package info (would be imported from package.json in real build)
const VERSION = '0.1.0';
const NAME = 'releasegate';
const DESCRIPTION = 'GenAI Release Gate - Test your LLM applications before release';

// =============================================================================
// Init Command
// =============================================================================

function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new ReleaseGate configuration file')
    .option('-f, --force', 'Overwrite existing config file')
    .option('-o, --output <filename>', 'Output filename', 'releasegate.yaml')
    .action((options: { force?: boolean; output?: string }) => {
      const filename = options.output || 'releasegate.yaml';
      const filepath = path.resolve(process.cwd(), filename);

      if (fs.existsSync(filepath) && !options.force) {
        console.error(`\x1b[31m✗ File already exists: ${filename}`);
        console.error('  Use --force to overwrite\x1b[0m');
        process.exit(1);
      }

      const config = generateSampleConfig();
      fs.writeFileSync(filepath, config, 'utf-8');

      console.log(`\x1b[32m✓ Created ${filename}\x1b[0m`);
      console.log('\nNext steps:');
      console.log(`  1. Edit ${filename} with your test cases`);
      console.log('  2. Set your API key: export OPENAI_API_KEY=...');
      console.log('  3. Run tests: releasegate run');
    });
}

// =============================================================================
// Validate Command
// =============================================================================

function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate configuration file without running tests')
    .option('-c, --config <path>', 'Path to configuration file')
    .action((options: { config?: string }) => {
      try {
        const { config, configPath, warnings } = loadConfig({
          configPath: options.config,
        });

        console.log(`\x1b[32m✓ Configuration is valid: ${configPath}\x1b[0m`);
        console.log(`\n  Project: ${config.project.name}`);
        console.log(`  Provider: ${config.provider.name}`);
        console.log(`  Suites: ${config.suites.length}`);
        console.log(`  Total tests: ${config.suites.reduce((sum, s) => sum + s.cases.length, 0)}`);

        if (warnings.length > 0) {
          console.log('\n  Warnings:');
          for (const warning of warnings) {
            console.log(`    \x1b[33m⚠ ${warning}\x1b[0m`);
          }
        }

        // Show suite breakdown
        console.log('\n  Suite breakdown:');
        for (const suite of config.suites) {
          console.log(`    - ${suite.name}: ${suite.cases.length} test(s)`);
        }
      } catch (error) {
        console.error(`\x1b[31m✗ Configuration error: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
        process.exit(1);
      }
    });
}

// =============================================================================
// Main Program
// =============================================================================

export function createProgram(): Command {
  const program = new Command()
    .name(NAME)
    .description(DESCRIPTION)
    .version(VERSION, '-V, --version', 'Show version number')
    .addCommand(createRunCommand())
    .addCommand(createInitCommand())
    .addCommand(createValidateCommand());

  // Default action when no command provided
  program.action(() => {
    program.help();
  });

  return program;
}

// Run if executed directly
if (require.main === module) {
  const program = createProgram();
  program.parseAsync(process.argv).catch((error) => {
    console.error(`\x1b[31m✗ ${error.message}\x1b[0m`);
    process.exit(1);
  });
}

// Exports for programmatic use
export { loadConfig, loadConfigFromString, generateSampleConfig } from './config/loader';
export { execute, Executor } from './runner/executor';
export { runEvaluator, getEvaluator } from './runner/evaluators';
export type { Config, TestCase, Suite, EvaluatorResult } from './config/types';
export type { RunResult, SuiteResult, TestCaseResult } from './runner/executor';
