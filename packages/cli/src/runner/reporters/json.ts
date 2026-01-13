import type { RunResult } from '../executor';

// JSON reporter
export class JsonReporter {
  format(result: RunResult): string {
    return JSON.stringify(result, null, 2);
  }
}
