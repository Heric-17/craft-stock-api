import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/domain/security/password-hasher.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../shared/domain/persistence/unit-of-work';
import { User } from '../../domain/user.entity';
import { EmailAlreadyInUseError, UserNotFoundError } from '../../domain/user.error';
import { USER_REPOSITORY, type UserRepository } from '../../domain/repositories/user.repository';
import type { RegisterUserInput, UserView } from '../dto/users.dto';
import { UserViewMapper } from '../mappers/user-view.mapper';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async register(input: RegisterUserInput): Promise<UserView> {
    const existing = await this.users.findByEmail(input.email);

    if (existing !== null) {
      throw new EmailAlreadyInUseError(`"${input.email}" is already registered.`);
    }

    const now = new Date();
    const passwordHash = await this.passwordHasher.hash(input.password);

    const user = new User({
      id: randomUUID(),
      email: input.email,
      passwordHash,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    });

    await this.unitOfWork.runInTransaction(async (ctx) => {
      await ctx.users.save(user);
    });

    return UserViewMapper.toView(user);
  }

  async getById(id: string): Promise<UserView> {
    const user = await this.users.findById(id);

    if (user === null) {
      throw new UserNotFoundError(`User ${id} was not found.`);
    }

    return UserViewMapper.toView(user);
  }
}
