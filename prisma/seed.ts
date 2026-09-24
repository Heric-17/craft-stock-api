import 'dotenv/config';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';

import { validateEnv } from '../src/config/env.schema';
import { PrismaClient } from '../src/shared/infrastructure/prisma/generated/client';

/**
 * Creates one login so a fresh installation has somewhere to start:
 * registration itself requires a bearer token, and there is no token before
 * there is an account. Runs automatically after `prisma migrate dev` /
 * `prisma migrate reset`, and is safe to run again — it does nothing once an
 * account with this email already exists.
 */
const DEFAULT_EMAIL = 'admin@craftstock.dev';
const DEFAULT_PASSWORD = 'senha-forte-123';
const DEFAULT_NAME = 'Admin';

async function main(): Promise<void> {
  const env = validateEnv(process.env);

  const email = process.env.SEED_USER_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;
  const name = process.env.SEED_USER_NAME ?? DEFAULT_NAME;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      console.log(`Seed: "${email}" already exists, skipping.`);
      return;
    }

    const passwordHash = await hash(password, { type: argon2id, timeCost: env.ARGON2_TIME_COST });
    const now = new Date();

    await prisma.user.create({
      data: { id: randomUUID(), email, passwordHash, name, createdAt: now, updatedAt: now },
    });

    console.log(`Seed: created "${email}" / "${password}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
