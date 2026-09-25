/**
 * The client every repository and `PrismaUnitOfWork` actually depend on —
 * `PrismaService` extended with the audit-capture extension (§15.2). Kept
 * separate from `PrismaService` itself because `$extends()` returns a new
 * object, not a `PrismaService` instance; `PrismaService` stays responsible
 * for connection lifecycle only.
 *
 * Deliberately its own file, not declared inside `prisma.module.ts`: several
 * providers `prisma.module.ts` registers (e.g. `PrismaRequestLogWriter`)
 * import this token, and `prisma.module.ts` imports those providers back to
 * register them — declaring the token in `prisma.module.ts` itself turns
 * that into a circular import, which under CommonJS resolves to `undefined`
 * on one side and fails DI with an unhelpful "argument at index [0]" error.
 */
export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
