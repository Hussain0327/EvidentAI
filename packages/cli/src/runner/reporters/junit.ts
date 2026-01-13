import type { RunResult } from '../executor';

// JUnit XML reporter
export class JUnitReporter {
  format(result: RunResult): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<testsuites name="${escapeXml(result.project)}" tests="${result.total}" failures="${result.failed}" time="${(result.durationMs / 1000).toFixed(3)}">`
    );

    for (const suite of result.suites) {
      const failures = suite.testCases.filter((t) => !t.result.passed).length;
      lines.push(
        `  <testsuite name="${escapeXml(suite.name)}" tests="${suite.total}" failures="${failures}" time="${(suite.durationMs / 1000).toFixed(3)}">`
      );

      for (const testCase of suite.testCases) {
        lines.push(
          `    <testcase name="${escapeXml(testCase.name)}" classname="${escapeXml(suite.name)}" time="${(testCase.latencyMs / 1000).toFixed(3)}">`
        );
        if (!testCase.result.passed) {
          lines.push(
            `      <failure message="${escapeXml(testCase.result.reason || 'Test failed')}">`
          );
          lines.push(`Score: ${testCase.result.score}`);
          if (testCase.result.details) {
            lines.push(`Details: ${JSON.stringify(testCase.result.details)}`);
          }
          lines.push('      </failure>');
        }
        lines.push('    </testcase>');
      }

      lines.push('  </testsuite>');
    }

    lines.push('</testsuites>');
    return lines.join('\n');
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
