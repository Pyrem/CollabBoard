import rateLimit from 'express-rate-limit';
import { AI_RATE_LIMIT_PER_MINUTE } from '@collabboard/shared';

/**
 * Create an `express-rate-limit` middleware scoped to the AI command endpoint.
 *
 * Limits each IP address to {@link AI_RATE_LIMIT_PER_MINUTE} requests per
 * 60-second sliding window. Uses `RateLimit-*` standard headers and disables
 * legacy `X-RateLimit-*` headers. When the limit is exceeded the response is
 * `429 Too Many Requests` with a JSON error body.
 *
 * @returns A pre-configured `express-rate-limit` middleware instance.
 *
 * @example
 * app.post('/api/ai-command', createRateLimiter(), authMiddleware, handler);
 *
 * @see {@link AI_RATE_LIMIT_PER_MINUTE} for the configurable limit value.
 */
export function createRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 60 * 1000,
    max: AI_RATE_LIMIT_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
}
