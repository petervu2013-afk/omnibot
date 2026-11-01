// Sends transactional email. Transports:
//   smtp   – real delivery (production; any provider with SMTP: SES, Mailgun, Postmark…)
//   file   – development: each email written to apps/api/.outbox/*.html (git-ignored) so links can be clicked
//   memory – tests: kept in `outbox`
// Sending never blocks or fails the HTTP request; a queue with retries replaces this in Step 5 (worker).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';
import type { MailContent } from './templates.js';

export interface SentMail extends MailContent {
  to: string;
  at: Date;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Env['MAIL_TRANSPORT'];
  private readonly from: string;
  private readonly smtp?: Transporter;
  /** Emails captured by the memory transport (tests). */
  readonly outbox: SentMail[] = [];

  constructor(config: ConfigService<Env, true>) {
    this.transport = config.get('MAIL_TRANSPORT', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    const url = config.get('SMTP_URL', { infer: true });
    if (this.transport === 'smtp' && url) this.smtp = createTransport(url);
  }

  /** Fire-and-forget: returns immediately; delivery errors are logged (without the email body). */
  send(to: string, content: MailContent): void {
    void this.deliver(to, content).catch((err: Error) => this.logger.error(`Gửi email "${content.subject}" thất bại: ${err.message}`));
  }

  /** Awaitable variant for callers that must know the result. */
  async deliver(to: string, content: MailContent): Promise<void> {
    const mail: SentMail = { to, at: new Date(), ...content };
    if (this.transport === 'memory') {
      this.outbox.push(mail);
      return;
    }
    if (this.transport === 'file') {
      const dir = join(process.cwd(), '.outbox');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${mail.at.toISOString().replace(/[:.]/g, '-')}-${to.replace(/[^\w.@-]/g, '_')}.html`);
      writeFileSync(file, `<!-- To: ${to} | Subject: ${content.subject} -->\n${content.html}`);
      // Only the subject and recipient are logged: links contain one-time tokens.
      this.logger.log(`[dev] Email "${content.subject}" → ${to} (xem thư mục .outbox)`);
      return;
    }
    await this.smtp!.sendMail({ from: this.from, to, subject: content.subject, text: content.text, html: content.html });
  }
}
