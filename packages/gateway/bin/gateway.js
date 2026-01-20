#!/usr/bin/env node

/**
 * EvidentAI Gateway CLI
 *
 * Start the LLM security gateway server.
 *
 * Usage:
 *   evidentai-gateway
 *
 * Environment Variables:
 *   GATEWAY_PORT           - Port to listen on (default: 3000)
 *   GATEWAY_HOST           - Host to bind to (default: 0.0.0.0)
 *   GATEWAY_API_KEY        - API key for authenticating requests
 *   OPENAI_API_KEY         - OpenAI API key for rephrasing
 *   GATEWAY_REPHRASE_MODEL - Model for rephrasing (default: gpt-4o-mini)
 *   GATEWAY_DETECT_INJECTION - Enable injection detection (default: true)
 *   GATEWAY_INJECTION_SENSITIVITY - Sensitivity: low, medium, high (default: medium)
 *   GATEWAY_INJECTION_ACTION - Action: block, rephrase, log (default: rephrase)
 *   GATEWAY_DETECT_PII     - Enable PII detection (default: true)
 *   GATEWAY_PII_TYPES      - Comma-separated PII types (default: email,phone,ssn,credit_card)
 *   GATEWAY_PII_ACTION     - Action: block, redact, log (default: redact)
 *   GATEWAY_LOGGING        - Enable logging (default: true)
 */

import('../dist/index.mjs').then((m) => {
  // Entry point is self-starting when run as main
}).catch((err) => {
  console.error('Failed to start EvidentAI Gateway:', err.message);
  process.exit(1);
});
