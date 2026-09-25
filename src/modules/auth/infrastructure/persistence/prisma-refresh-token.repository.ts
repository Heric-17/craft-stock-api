import { Inject, Injectable } from '@nestjs/common';

import { PRISMA_CLIENT } from '../../../../shared/infrastructure/prisma/prisma-client.token';
import type { Prisma } from '../../../../shared/infrastructure/prisma/generated/client';
import type { RefreshToken } from '../../domain/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { RefreshTokenMapper } from './mappers/refresh-token.mapper';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: Prisma.TransactionClient) {}

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row ? RefreshTokenMapper.toDomain(row) : null;
  }

  async save(token: RefreshToken): Promise<void> {
    const data = RefreshTokenMapper.toPersistence(token);

    await this.prisma.refreshToken.upsert({
      where: { id: token.id },
      create: data,
      update: data,
    });
  }
}
