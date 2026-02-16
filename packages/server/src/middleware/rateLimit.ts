import rateLimit from 'express-rate-limit';
import { AI_RATE_LIMIT_PER_MINUTE } from '@collabboard/shared';

export function createRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 60 * 1000,
    max: AI_RATE_LIMIT_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
}
