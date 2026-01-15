/**
 * Logger Utility
 *
 * Provides consistent, color-aware logging throughout the CLI.
 * Respects NO_COLOR environment variable and --no-color flag.
 */

// =============================================================================
// Color Control
// =============================================================================

/**
 * Check if colors should be disabled.
 * Respects:
 * - NO_COLOR environment variable (https://no-color.org/)
 * - FORCE_COLOR=0 environment variable
 * - Non-TTY output (piping to files)
 */
export function shouldDisableColors(): boolean {
  // NO_COLOR takes precedence (any value means no colors)
  if (process.env.NO_COLOR !== undefined) {
    return true;
  }

  // FORCE_COLOR=0 disables colors
  if (process.env.FORCE_COLOR === '0') {
    return true;
  }

  // Check if stdout is a TTY
  if (!process.stdout.isTTY) {
    return true;
  }

  return false;
}

// Global flag that can be set by --no-color CLI flag
let noColorFlag = false;

/**
 * Set the no-color flag from CLI
 */
export function setNoColor(value: boolean): void {
  noColorFlag = value;
}

/**
 * Check if colors are currently enabled
 */
export function colorsEnabled(): boolean {
  return !noColorFlag && !shouldDisableColors();
}

// =============================================================================
// ANSI Color Codes
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
} as const;

type ColorName = keyof typeof COLORS;

/**
 * Apply color to text if colors are enabled
 */
export function colorize(text: string, color: ColorName): string {
  if (!colorsEnabled()) {
    return text;
  }
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// =============================================================================
// Logger Class
// =============================================================================

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
}

class Logger {
  private verbose: boolean;
  private quiet: boolean;

  constructor(options: LoggerOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.quiet = options.quiet ?? false;
  }

  /**
   * Configure logger options
   */
  configure(options: LoggerOptions): void {
    if (options.verbose !== undefined) {
      this.verbose = options.verbose;
    }
    if (options.quiet !== undefined) {
      this.quiet = options.quiet;
    }
  }

  /**
   * Log an info message
   */
  info(message: string): void {
    if (!this.quiet) {
      console.log(message);
    }
  }

  /**
   * Log a success message with green checkmark
   */
  success(message: string): void {
    if (!this.quiet) {
      console.log(colorize(`✓ ${message}`, 'green'));
    }
  }

  /**
   * Log a warning message with yellow warning sign
   */
  warn(message: string): void {
    if (!this.quiet) {
      console.warn(colorize(`⚠ ${message}`, 'yellow'));
    }
  }

  /**
   * Log an error message with red X
   */
  error(message: string): void {
    console.error(colorize(`✗ ${message}`, 'red'));
  }

  /**
   * Log a debug message (only in verbose mode)
   */
  debug(message: string): void {
    if (this.verbose) {
      console.log(colorize(message, 'gray'));
    }
  }

  /**
   * Log a dim/secondary message
   */
  dim(message: string): void {
    if (!this.quiet) {
      console.log(colorize(message, 'dim'));
    }
  }

  /**
   * Log a header/title
   */
  header(message: string): void {
    if (!this.quiet) {
      console.log(colorize(message, 'bold'));
    }
  }

  /**
   * Create a child logger with different options
   */
  child(options: LoggerOptions): Logger {
    return new Logger({
      verbose: options.verbose ?? this.verbose,
      quiet: options.quiet ?? this.quiet,
    });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const logger = new Logger();

// =============================================================================
// Convenience Functions
// =============================================================================

export function log(message: string): void {
  logger.info(message);
}

export function success(message: string): void {
  logger.success(message);
}

export function warn(message: string): void {
  logger.warn(message);
}

export function error(message: string): void {
  logger.error(message);
}

export function debug(message: string): void {
  logger.debug(message);
}
