import { Module } from '@nestjs/common';

import { EnvModule } from '../../../config/env.module';
import { PASSWORD_HASHER } from '../../domain/security/password-hasher.port';
import { Argon2PasswordHasher } from './argon2-password-hasher';

@Module({
  imports: [EnvModule],
  providers: [{ provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }],
  exports: [PASSWORD_HASHER],
})
export class PasswordHasherModule {}
