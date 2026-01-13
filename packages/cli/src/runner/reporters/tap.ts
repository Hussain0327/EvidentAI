import type { RunResult } from '../executor';

// TAP reporter
export class TapReporter {
  format(result: RunResult): string {
    const lines: string[] = [];
    lines.push('TAP version 14');
    lines.push(`1..${result.total}`);

    let testNum = 1;
    for (const suite of result.suites) {
      lines.push(`# Suite: ${suite.name}`);
      for (const testCase of suite.testCases) {
        const status = testCase.result.passed ? 'ok' : 'not ok';
        lines.push(`${status} ${testNum} - ${suite.name}::${testCase.name}`);
        if (!testCase.result.passed) {
          lines.push('  ---');
          lines.push(`  reason: ${testCase.result.reason}`);
          lines.push(`  score: ${testCase.result.score}`);
          lines.push('  ...');
        }
        testNum++;
      }
    }

    lines.push(`# Tests: ${result.total}`);
    lines.push(`# Pass: ${result.passed}`);
    lines.push(`# Fail: ${result.failed}`);
    lines.push(`# Pass Rate: ${(result.passRate * 100).toFixed(1)}%`);

    return lines.join('\n');
  }
}
