import type { RefreshTokenModel } from '../../../../../shared/infrastructure/prisma/generated/models';
import type { Prisma } from '../../../../../shared/infrastructure/prisma/generated/client';
import { RefreshToken } from '../../../domain/refresh-token.entity';

export class RefreshTokenMapper {
  static toDomain(row: RefreshTokenModel): RefreshToken {
    return new RefreshToken({
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(token: RefreshToken): Prisma.RefreshTokenUncheckedCreateInput {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
      createdAt: token.createdAt,
    };
  }
}
