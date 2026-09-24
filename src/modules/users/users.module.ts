import { Module } from '@nestjs/common';

import { PasswordHasherModule } from '../../shared/infrastructure/security/password-hasher.module';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module';
import { UnitOfWorkModule } from '../../shared/infrastructure/persistence/unit-of-work.module';
import { UsersService } from './application/services/users.service';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { UsersController } from './presentation/users.controller';

@Module({
  imports: [PrismaModule, UnitOfWorkModule, PasswordHasherModule],
  controllers: [UsersController],
  providers: [{ provide: USER_REPOSITORY, useClass: PrismaUserRepository }, UsersService],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
