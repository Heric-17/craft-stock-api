import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { EnvService } from '../../../config/env.service';
import {
  CurrentUser,
  type AuthenticatedRequestUser,
} from '../../../shared/presentation/decorators/current-user.decorator';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { RateLimit } from '../../../shared/presentation/decorators/rate-limit.decorator';
import type { SessionResponse, SessionResult } from '../application/dto/auth.dto';
import { AuthenticationService } from '../application/services/authentication.service';
import { PasswordService } from '../application/services/password.service';
import { InvalidRefreshTokenError } from '../domain/auth.error';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  AUTH_ROUTE,
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
  type RefreshTokenCookieConfig,
} from './refresh-token-cookie';

@Controller(AUTH_ROUTE)
export class AuthController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly passwords: PasswordService,
    private readonly env: EnvService,
  ) {}

  @Public()
  @RateLimit('AUTH')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const session = await this.authentication.login({ email: dto.email, password: dto.password });

    return this.establishSession(session, response);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const presented = readRefreshTokenCookie(request);

    if (presented === null) {
      throw new InvalidRefreshTokenError('Refresh token is invalid, expired, or already used.');
    }

    const session = await this.authentication.refresh(presented);

    return this.establishSession(session, response);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const presented = readRefreshTokenCookie(request);

    if (presented !== null) {
      await this.authentication.logout(presented);
    }

    clearRefreshTokenCookie(response, this.cookieConfig());
  }

  /**
   * Under `/auth` and not `/users` on purpose: the refresh cookie is only
   * sent to this path, and the session making the request is the one that has
   * to stay open. A 422, not a 401, when the current password is wrong — a
   * client reads 401 as an expired session and signs the person out.
   */
  @RateLimit('AUTH')
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.passwords.changePassword({
      userId: user.id,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
      currentRefreshToken: readRefreshTokenCookie(request),
    });
  }

  /** Always 204, whether or not the address belongs to an account. */
  @Public()
  @RateLimit('RECOVERY')
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwords.requestReset(dto.email);
  }

  @Public()
  @RateLimit('RECOVERY')
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwords.resetPassword({ token: dto.token, newPassword: dto.newPassword });
  }

  private establishSession(session: SessionResult, response: Response): SessionResponse {
    const { refreshToken, ...body } = session;

    setRefreshTokenCookie(response, refreshToken, this.cookieConfig());

    return body;
  }

  private cookieConfig(): RefreshTokenCookieConfig {
    return {
      secure: this.env.get('AUTH_COOKIE_SECURE'),
      maxAgeSeconds: this.env.get('REFRESH_TOKEN_EXPIRES_IN_SECONDS'),
    };
  }
}
