import { Module } from '@nestjs/common';

import { EnvModule } from '../../config/env.module';
import { PasswordHasherModule } from '../../shared/infrastructure/security/password-hasher.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { AuthenticationService } from './application/services/authentication.service';
import { TOKEN_PROVIDER } from './domain/ports/token-provider.port';
import { JwtTokenProvider } from './infrastructure/security/jwt-token.provider';
import { AuthController } from './presentation/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

@Module({
  imports: [EnvModule, UnitOfWorkModule, PasswordHasherModule],
  controllers: [AuthController],
  providers: [
    { provide: TOKEN_PROVIDER, useClass: JwtTokenProvider },
    AuthenticationService,
    JwtAuthGuard,
  ],
  exports: [TOKEN_PROVIDER, JwtAuthGuard],
})
export class AuthModule {}
