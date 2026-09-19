import type { UserModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import type { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { User } from '../../../domain/user.entity';

export class UserMapper {
  static toDomain(row: UserModel): User {
    return new User({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toPersistence(user: User): Prisma.UserUncheckedCreateInput {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
