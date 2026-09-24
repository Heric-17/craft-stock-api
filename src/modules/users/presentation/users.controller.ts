import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedRequestUser,
} from '../../../shared/presentation/decorators/current-user.decorator';
import type { UserView } from '../application/dto/users.dto';
import { UsersService } from '../application/services/users.service';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Not `@Public()`: the only unauthenticated entry points are login and the
   * health check. There are no roles, so any authenticated user may register
   * another — the first account in a fresh installation is created outside
   * the HTTP API, not through this endpoint.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterUserDto): Promise<UserView> {
    return this.usersService.register({ email: dto.email, password: dto.password, name: dto.name });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedRequestUser): Promise<UserView> {
    return this.usersService.getById(user.id);
  }
}
