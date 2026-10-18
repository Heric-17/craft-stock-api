import { Inject, Injectable } from '@nestjs/common';

import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { PasswordResetToken } from '../../domain/password-reset-token.entity';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import { PasswordResetTokenMapper } from './mappers/password-reset-token.mapper';

@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    return row ? PasswordResetTokenMapper.toDomain(row) : null;
  }

  async findLatestByUserId(userId: string): Promise<PasswordResetToken | null> {
    const row = await this.prisma.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? PasswordResetTokenMapper.toDomain(row) : null;
  }

  async save(token: PasswordResetToken): Promise<void> {
    const data = PasswordResetTokenMapper.toPersistence(token);

    await this.prisma.passwordResetToken.upsert({
      where: { id: token.id },
      create: data,
      update: data,
    });
  }

  async markAllUsedByUserId(userId: string, now: Date): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
  }
}
