import { Throttle } from '@nestjs/throttler';

/** Stricter per-IP limit on credential endpoints (AUTH_RATE_LIMIT_PER_MINUTE, default 10/min per route). */
export const AuthThrottle = () => Throttle({ default: { ttl: 60_000, limit: () => Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10) } });
