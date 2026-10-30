// /v1/auth/* – contract in docs/openapi.yaml.
// Web (platform WEB) receives the refresh token only as an HttpOnly cookie scoped to /v1/auth; mobile apps
// (ANDROID/IOS) receive it in the body and keep it in Keychain/Keystore.
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { apiError } from '../common/api-error.js';
import { Public } from '../common/public.decorator.js';
import { parse } from '../common/validation.js';
import type { AuthContext, AuthedRequest } from './auth.guard.js';
import { changePasswordSchema, emailSchema, loginSchema, passwordConfirmSchema, refreshSchema, registerSchema, resetPasswordSchema, tokenSchema } from './auth.schemas.js';
import { AuthService, type RequestMeta } from './auth.service.js';
import type { ClientPlatform } from '../generated/prisma/client.js';

export const REFRESH_COOKIE = 'omnibot_rt';
const COOKIE_PATH = '/v1/auth';

// Stricter per-IP limit on credential endpoints (AUTH_RATE_LIMIT_PER_MINUTE, default 10/min per route).
const AuthThrottle = () => Throttle({ default: { ttl: 60_000, limit: () => Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10) } });

function meta(req: AuthedRequest): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
}

function readCookie(req: AuthedRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function auth(req: AuthedRequest): AuthContext {
  if (!req.auth) throw apiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
  return req.auth;
}

type Issued = Awaited<ReturnType<AuthService['login']>>;

/** Sets the cookie for web clients and strips the refresh token from their response body. */
function deliver(res: Response, platform: ClientPlatform, issued: Issued) {
  if (platform !== 'WEB') return issued;
  res.cookie(REFRESH_COOKIE, issued.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: COOKIE_PATH,
    expires: issued.refreshTokenExpiresAt,
  });
  const { refreshToken: _omit, ...body } = issued;
  return body;
}

function clearCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: true, sameSite: 'strict', path: COOKIE_PATH });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @AuthThrottle()
  @Post('register')
  async register(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const input = parse(registerSchema, body);
    const issued = await this.auth.register(input, { ...meta(req), platform: input.platform, deviceName: input.deviceName });
    res.status(201);
    return deliver(res, input.platform, issued);
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const input = parse(loginSchema, body);
    const issued = await this.auth.login(input, { ...meta(req), platform: input.platform, deviceName: input.deviceName });
    return deliver(res, input.platform, issued);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const fromBody = parse(refreshSchema, body).refreshToken;
    const token = fromBody ?? readCookie(req, REFRESH_COOKIE);
    if (!token) throw apiError(401, 'REFRESH_INVALID', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
    try {
      const issued = await this.auth.refresh(token, meta(req));
      return deliver(res, fromBody ? 'ANDROID' : 'WEB', issued);
    } catch (err) {
      if (!fromBody) clearCookie(res);
      throw err;
    }
  }

  /** Works with an expired access token: identifies the session by its refresh token (cookie or body). */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(parse(refreshSchema, body).refreshToken ?? readCookie(req, REFRESH_COOKIE), meta(req));
    clearCookie(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(auth(req).userId, meta(req));
    clearCookie(res);
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(auth(req).userId);
  }

  @Get('sessions')
  sessions(@Req() req: AuthedRequest) {
    const { userId, familyId } = auth(req);
    return this.auth.listSessions(userId, familyId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@Param('id') id: string, @Req() req: AuthedRequest) {
    await this.auth.revokeSession(auth(req).userId, id, meta(req));
  }

  @Public()
  @AuthThrottle()
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown, @Req() req: AuthedRequest) {
    await this.auth.verifyEmail(parse(tokenSchema, body).token, meta(req));
  }

  @Public()
  @AuthThrottle()
  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body() body: unknown) {
    await this.auth.resendVerification(parse(emailSchema, body).email);
    return { message: 'Nếu email đã đăng ký và chưa xác minh, chúng tôi đã gửi lại liên kết xác minh.' };
  }

  @Public()
  @AuthThrottle()
  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Body() body: unknown) {
    const { email } = parse(emailSchema, body);
    // Not awaited: the response time must not depend on whether the account exists.
    void this.auth.forgotPassword(email).catch(() => undefined);
    return { message: 'Nếu email đã đăng ký, chúng tôi đã gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút).' };
  }

  @Public()
  @AuthThrottle()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const { token, password } = parse(resetPasswordSchema, body);
    await this.auth.resetPassword(token, password, meta(req));
    clearCookie(res);
  }

  @AuthThrottle()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @Req() req: AuthedRequest) {
    const { currentPassword, newPassword } = parse(changePasswordSchema, body);
    const { userId, familyId } = auth(req);
    await this.auth.changePassword(userId, familyId, currentPassword, newPassword, meta(req));
  }

  @AuthThrottle()
  @Post('delete-account')
  @HttpCode(202)
  async deleteAccount(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.requestDeletion(auth(req).userId, parse(passwordConfirmSchema, body).password, meta(req));
    clearCookie(res);
    return { ...result, message: 'Đã nhận yêu cầu xóa tài khoản. Đăng nhập lại trước thời hạn để hủy yêu cầu.' };
  }

  @Post('cancel-deletion')
  @HttpCode(200)
  cancelDeletion(@Req() req: AuthedRequest) {
    return this.auth.cancelDeletion(auth(req).userId, meta(req));
  }
}
