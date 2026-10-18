import { Module } from '@nestjs/common';

import { EnvModule } from '../../config/env.module';
import { EmailModule } from '../../shared/infrastructure/email/email.module';
import { PasswordHasherModule } from '../../shared/infrastructure/security/password-hasher.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { AuthenticationService } from './application/services/authentication.service';
import { PasswordService } from './application/services/password.service';
import { TOKEN_PROVIDER } from './domain/ports/token-provider.port';
import { JwtTokenProvider } from './infrastructure/security/jwt-token.provider';
import { AuthController } from './presentation/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

@Module({
  imports: [EnvModule, UnitOfWorkModule, PasswordHasherModule, EmailModule],
  controllers: [AuthController],
  providers: [
    { provide: TOKEN_PROVIDER, useClass: JwtTokenProvider },
    AuthenticationService,
    PasswordService,
    JwtAuthGuard,
  ],
  exports: [TOKEN_PROVIDER, JwtAuthGuard],
})
export class AuthModule {}
