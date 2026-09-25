"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_crypto_1 = require("node:crypto");
const adapter_pg_1 = require("@prisma/adapter-pg");
const argon2_1 = require("argon2");
const env_schema_1 = require("../src/config/env.schema");
const client_1 = require("../src/shared/infrastructure/prisma/generated/client");
const DEFAULT_EMAIL = 'admin@craftstock.dev';
const DEFAULT_PASSWORD = 'senha-forte-123';
const DEFAULT_NAME = 'Admin';
async function main() {
    const env = (0, env_schema_1.validateEnv)(process.env);
    const email = process.env.SEED_USER_EMAIL ?? DEFAULT_EMAIL;
    const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;
    const name = process.env.SEED_USER_NAME ?? DEFAULT_NAME;
    const prisma = new client_1.PrismaClient({
        adapter: new adapter_pg_1.PrismaPg({ connectionString: env.DATABASE_URL }),
    });
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            console.log(`Seed: "${email}" already exists, skipping.`);
            return;
        }
        const passwordHash = await (0, argon2_1.hash)(password, { type: argon2_1.argon2id, timeCost: env.ARGON2_TIME_COST });
        const now = new Date();
        await prisma.user.create({
            data: { id: (0, node_crypto_1.randomUUID)(), email, passwordHash, name, createdAt: now, updatedAt: now },
        });
        console.log(`Seed: created "${email}" / "${password}".`);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map