import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '../../../shared/presentation/decorators/public.decorator';
import type { LoginResult } from '../application/dto/auth.dto';
import { AuthenticationService } from '../application/services/authentication.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authentication: AuthenticationService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authentication.login({ email: dto.email, password: dto.password });
  }

  /**
   * Public like login: a client calling this has, by definition, no valid
   * access token left — that is the whole reason it needs to refresh one.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<LoginResult> {
    return this.authentication.refresh(dto.refreshToken);
  }

  /**
   * Public for the same reason: revoking a session must not itself require
   * a live access token, since the point may be to end a session whose
   * access token already expired.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authentication.logout(dto.refreshToken);
  }
}
