import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenService } from './access-token.service.js';
import { AccountPurgeService } from './account-purge.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CaptchaService } from './captcha.service.js';
import { LoginAttemptsService } from './login-attempts.service.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [AccessTokenService, AccountPurgeService, AuthService, CaptchaService, LoginAttemptsService, SessionService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AccessTokenService, SessionService, LoginAttemptsService],
})
export class AuthModule {}
