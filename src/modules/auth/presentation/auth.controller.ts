import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { EnvService } from '../../../config/env.service';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import type { SessionResponse, SessionResult } from '../application/dto/auth.dto';
import { AuthenticationService } from '../application/services/authentication.service';
import { InvalidRefreshTokenError } from '../domain/auth.error';
import { LoginDto } from './dto/login.dto';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
  type RefreshTokenCookieConfig,
} from './refresh-token-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly env: EnvService,
  ) {}

  @Public()
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
