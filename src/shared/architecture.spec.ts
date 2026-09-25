import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { globSync } from 'node:fs';

const SOURCE_ROOT = join(__dirname, '..');

/**
 * Anything that would drag the ORM across the boundary. The generated client
 * lives inside `infrastructure/`, so a file outside it that reaches for
 * either name is reaching past the abstraction.
 */
const FORBIDDEN_IMPORTS = [
  /from\s+['"]@prisma\/client['"]/,
  /from\s+['"][^'"]*prisma\/generated[^'"]*['"]/,
];

/** Things `domain/` must not know about at all: it is plain TypeScript. */
const FORBIDDEN_IN_DOMAIN = [
  { pattern: /from\s+['"]@nestjs\/[^'"]+['"]/, what: '@nestjs' },
  { pattern: /from\s+['"]@prisma\/client['"]/, what: '@prisma/client' },
  { pattern: /from\s+['"]express['"]/, what: 'express' },
  { pattern: /from\s+['"]cheerio['"]/, what: 'cheerio' },
  { pattern: /from\s+['"]axios['"]/, what: 'axios' },
];

function sourceFiles(): string[] {
  return globSync('**/*.ts', { cwd: SOURCE_ROOT })
    .map((file) => file.split('/').join(sep))
    .filter((file) => !file.startsWith(join('shared', 'infrastructure', 'prisma', 'generated')))
    .filter((file) => !file.endsWith('.spec.ts'));
}

function isInfrastructure(file: string): boolean {
  return file.split(sep).includes('infrastructure');
}

function isDomain(file: string): boolean {
  return file.split(sep).includes('domain');
}

function read(file: string): string {
  return readFileSync(join(SOURCE_ROOT, file), 'utf8');
}

/**
 * The rule of section 12, as a property of the build rather than an
 * intention recorded in documentation.
 *
 * An architectural rule that rests on a developer remembering it degrades
 * quietly as the project grows: one pragmatic shortcut in a read-only query
 * is invisible in review and is indistinguishable, a year later, from a
 * decision. Checking it here makes the coupling impossible to introduce
 * without the build saying so.
 */
describe('the ORM never leaves infrastructure/', () => {
  const files = sourceFiles();

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.filter((file) => !isInfrastructure(file)))(
    '%s does not import the Prisma client',
    (file) => {
      const contents = read(file);

      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(contents).not.toMatch(forbidden);
      }
    },
  );

  /**
   * "Indirectly" counts too: a domain type that imports `Decimal`, or
   * derives from a generated type, has brought the database back in just as
   * surely as an explicit import.
   */
  it.each(files.filter((file) => !isInfrastructure(file)))(
    '%s names no Prisma-generated type',
    (file) => {
      const contents = read(file);

      expect(contents).not.toMatch(/\bPrisma\.\w+/);
      expect(contents).not.toMatch(/\bPrisma\.Decimal\b/);
    },
  );
});

describe('domain/ is plain TypeScript', () => {
  const domainFiles = sourceFiles().filter(isDomain);

  it('finds domain files to check', () => {
    expect(domainFiles.length).toBeGreaterThan(20);
  });

  it.each(domainFiles)('%s imports no framework or infrastructure library', (file) => {
    const contents = read(file);

    for (const { pattern, what } of FORBIDDEN_IN_DOMAIN) {
      if (pattern.test(contents)) {
        throw new Error(
          `${relative('', file)} imports ${what}, which domain/ must not know about.`,
        );
      }
    }
  });
});

describe('there is no PurchaseItemRepository', () => {
  /**
   * A repository for the line would make it possible to load one, change its
   * classification and save it again — the one path that could leave
   * `allocatedDiscount` attributed to a line no longer in the eligible group.
   * Its absence is what makes that unreachable rather than discouraged.
   */
  it('no file declares one', () => {
    // A declaration, not a mention: the two places that explain why it does
    // not exist are supposed to say its name.
    const declaration =
      /(?:interface|class|const)\s+(?:\w*PurchaseItemRepository|PURCHASE_ITEM_REPOSITORY)\b/;
    const offenders = sourceFiles().filter((file) => declaration.test(read(file)));

    expect(offenders).toEqual([]);
  });
});

describe('there is no AuditLogRepository', () => {
  /**
   * §15.2: application code never writes an AuditLog row directly — only the
   * Prisma extension does, from inside infrastructure/. A repository for it
   * would make that bypassable (load a row, mutate it, save it back),
   * defeating the whole point of capture being automatic and generic. Reads
   * go through `AuditTrailReader`, a query port, deliberately not named
   * "Repository".
   */
  it('no file declares one', () => {
    const declaration = /(?:interface|class|const)\s+(?:\w*AuditLogRepository|AUDIT_LOG_REPOSITORY)\b/;
    const offenders = sourceFiles().filter((file) => declaration.test(read(file)));

    expect(offenders).toEqual([]);
  });
});

describe('no production code writes to test/fixtures/', () => {
  /**
   * A fixture updated automatically would make the tests validate the new
   * markup and stay green, destroying the alarm that the scraping has broken.
   */
  it('no source file writes there', () => {
    const offenders = sourceFiles().filter((file) => {
      const contents = read(file);

      return (
        /test[/\\]fixtures/.test(contents) &&
        /writeFile|createWriteStream|appendFile/.test(contents)
      );
    });

    expect(offenders).toEqual([]);
  });
});
