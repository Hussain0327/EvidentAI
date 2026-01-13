import type { RunResult } from '../executor';

// GitHub PR reporter
export class GithubPrReporter {
  format(result: RunResult): string {
    const passed = result.thresholdsResult.passed;
    const status = passed ? '\u2705 PASSED' : '\u274c FAILED';

    const lines: string[] = [];
    lines.push(`## ReleaseGate Results: ${status}`);
    lines.push('');
    lines.push(`**Project:** ${result.project}`);
    lines.push(`**Run ID:** ${result.runId}`);
    lines.push(`**Tests:** ${result.passed}/${result.total} passed (${(result.passRate * 100).toFixed(1)}%)`);
    lines.push(`**Avg Score:** ${(result.averageScore * 100).toFixed(1)}%`);
    lines.push('');

    lines.push('### Suites');
    lines.push('');
    lines.push('| Suite | Passed | Total | Status |');
    lines.push('| --- | --- | --- | --- |');
    for (const suite of result.suites) {
      const suiteStatus = suite.failed === 0 ? '\u2705' : '\u274c';
      lines.push(`| ${suite.name} | ${suite.passed} | ${suite.total} | ${suiteStatus} |`);
    }

    if (result.thresholdsResult.checks.length > 0) {
      lines.push('');
      lines.push('### Thresholds');
      lines.push('');
      lines.push('| Check | Actual | Threshold | Status |');
      lines.push('| --- | --- | --- | --- |');
      for (const check of result.thresholdsResult.checks) {
        const checkStatus = check.passed ? '\u2705' : '\u274c';
        lines.push(`| ${check.name} | ${(check.actual * 100).toFixed(1)}% | ${(check.threshold * 100).toFixed(1)}% | ${checkStatus} |`);
      }
    }

    return lines.join('\n');
  }
}
