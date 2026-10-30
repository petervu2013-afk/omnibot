// Server-side CAPTCHA check (Cloudflare Turnstile). Without TURNSTILE_SECRET_KEY (development/test; refused in
// production by env validation) any non-empty token is accepted so the flow can be exercised locally.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secret?: string;

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get('TURNSTILE_SECRET_KEY', { infer: true });
  }

  async verify(token: string | undefined, ip?: string): Promise<boolean> {
    if (!token) return false;
    if (!this.secret) return true;
    try {
      const body = new URLSearchParams({ secret: this.secret, response: token, ...(ip ? { remoteip: ip } : {}) });
      const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch (err) {
      this.logger.error(`Không kiểm tra được CAPTCHA: ${(err as Error).message}`);
      return false;
    }
  }
}
