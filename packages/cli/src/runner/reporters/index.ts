import { ConsoleReporter } from './console';
import { JsonReporter } from './json';
import { TapReporter } from './tap';
import { JUnitReporter } from './junit';
import { GithubPrReporter } from './github-pr';

export type ReporterFormat = 'pretty' | 'json' | 'tap' | 'junit';

export function getReporter(format: ReporterFormat) {
  switch (format) {
    case 'json':
      return new JsonReporter();
    case 'tap':
      return new TapReporter();
    case 'junit':
      return new JUnitReporter();
    case 'pretty':
    default:
      return new ConsoleReporter();
  }
}

export { ConsoleReporter } from './console';
export { JsonReporter } from './json';
export { TapReporter } from './tap';
export { JUnitReporter } from './junit';
export { GithubPrReporter } from './github-pr';
