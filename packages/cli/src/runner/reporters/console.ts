import type { RunResult } from '../executor';

// Console reporter
export class ConsoleReporter {
  format(result: RunResult): string {
    const lines: string[] = [];
    const passed = result.thresholdsResult.passed;
    const statusEmoji = passed ? '\u2705' : '\u274c';
    const statusText = passed ? 'PASSED' : 'FAILED';

    const divider = '\u2501'.repeat(48);

    lines.push('');
    lines.push(divider);
    lines.push(`  ${statusEmoji} ReleaseGate Results: ${statusText}`);
    lines.push(divider);
    lines.push('');

    // Summary
    lines.push(`  Project:    ${result.project}`);
    lines.push(`  Run ID:     ${result.runId}`);
    lines.push(`  Duration:   ${(result.durationMs / 1000).toFixed(2)}s`);
    lines.push('');

    // Overall stats
    lines.push(`  Tests:      ${result.passed}/${result.total} passed (${(result.passRate * 100).toFixed(1)}%)`);
    lines.push(`  Avg Score:  ${(result.averageScore * 100).toFixed(1)}%`);
    lines.push('');

    // Suite breakdown
    lines.push('  Suites:');
    for (const suite of result.suites) {
      const suiteStatus = suite.failed === 0 ? '\u2713' : '\u2717';
      lines.push(`    ${suiteStatus} ${suite.name}: ${suite.passed}/${suite.total} passed`);

      // Show failed tests
      const failedTests = suite.testCases.filter((t) => !t.result.passed);
      for (const test of failedTests) {
        lines.push(`      \u2717 ${test.name}`);
        lines.push(`        Reason: ${test.result.reason}`);
      }
    }
    lines.push('');

    // Thresholds
    if (result.thresholdsResult.checks.length > 0) {
      lines.push('  Thresholds:');
      for (const check of result.thresholdsResult.checks) {
        const checkStatus = check.passed ? '\u2713' : '\u2717';
        lines.push(`    ${checkStatus} ${check.name}: ${(check.actual * 100).toFixed(1)}% (threshold: ${(check.threshold * 100).toFixed(1)}%)`);
      }
      lines.push('');
    }

    lines.push(divider);
    lines.push('');

    return lines.join('\n');
  }
}
