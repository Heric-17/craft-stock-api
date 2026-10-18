import type { PasswordResetTokenModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import type { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { PasswordResetToken } from '../../../domain/password-reset-token.entity';

export class PasswordResetTokenMapper {
  static toDomain(row: PasswordResetTokenModel): PasswordResetToken {
    return new PasswordResetToken({
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(token: PasswordResetToken): Prisma.PasswordResetTokenUncheckedCreateInput {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
      createdAt: token.createdAt,
    };
  }
}
