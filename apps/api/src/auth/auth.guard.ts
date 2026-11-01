// Global guard: every route requires a valid access token unless marked @Public(). Besides the JWT signature it
// checks that the session family is still active, so logout / revoke / password change take effect immediately.
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiError } from '../common/api-error.js';
import { IS_PUBLIC } from '../common/public.decorator.js';
import type { RequestWithId } from '../common/request-context.js';
import { AccessTokenService } from './access-token.service.js';
import { SessionService } from './session.service.js';

export interface AuthContext {
  userId: string;
  familyId: string;
}
export type AuthedRequest = RequestWithId & { auth?: AuthContext };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw apiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
    const claims = await this.tokens.verify(token);
    if (!claims) throw apiError(401, 'TOKEN_INVALID', 'Phiên đăng nhập đã hết hạn. Vui lòng làm mới hoặc đăng nhập lại.');
    if (!(await this.sessions.isActive(claims.sub, claims.sid))) throw apiError(401, 'SESSION_REVOKED', 'Phiên đăng nhập đã bị đăng xuất. Vui lòng đăng nhập lại.');
    req.auth = { userId: claims.sub, familyId: claims.sid };
    return true;
  }
}
