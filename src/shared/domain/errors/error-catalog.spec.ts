import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join, sep } from 'node:path';

import { toErrorCode } from './error-code';

const SOURCE_ROOT = join(__dirname, '..', '..', '..');
const API_CONTRACT = join(SOURCE_ROOT, '..', 'docs', 'api-contract.md');

/**
 * Every class that extends `DomainError`, read statically out of the
 * `*.error.ts` files — the same technique as `architecture.spec.ts`, and for
 * the same reason: a rule that depends on someone remembering it decays. No
 * class is instantiated, because each one has its own constructor arguments
 * and the names are all this needs.
 */
function declaredDomainErrors(): { className: string; file: string }[] {
  const declarations: { className: string; file: string }[] = [];

  for (const relative of globSync('**/*.error.ts', { cwd: SOURCE_ROOT })) {
    const file = relative.split('/').join(sep);
    const contents = readFileSync(join(SOURCE_ROOT, file), 'utf8');

    for (const match of contents.matchAll(/export class (\w+) extends DomainError/g)) {
      declarations.push({ className: match[1], file });
    }
  }

  return declarations;
}

describe('the domain error catalog', () => {
  const declarations = declaredDomainErrors();
  const contract = readFileSync(API_CONTRACT, 'utf8');

  it('finds the error classes to check', () => {
    // A guard on the glob itself: a regex that stopped matching would
    // otherwise make every assertion below pass over an empty list.
    expect(declarations.length).toBeGreaterThan(30);
  });

  it.each(declarations.map(({ className }) => className))(
    '%s derives a SCREAMING_SNAKE_CASE code',
    (className) => {
      expect(toErrorCode(className)).toMatch(/^[A-Z][A-Z0-9_]*$/);
    },
  );

  /**
   * The acceptance criterion "every domain error has a stable code and the
   * contract table is complete", as a property of the build.
   *
   * Adding an error class and forgetting to document it fails here, which is
   * the only way the published table stays trustworthy — a client translates
   * by `code`, so an undocumented one reaches a screen as untranslated
   * English.
   */
  it.each(declarations.map(({ className, file }) => [toErrorCode(className), className, file]))(
    '%s (%s, in %s) is documented in docs/api-contract.md',
    (code) => {
      expect(contract).toContain(`\`${code}\``);
    },
  );

  /**
   * Two distinct error *names* must never produce the same code: that would
   * publish one identifier for two different situations, and no client could
   * tell them apart. There is no acceptable case, so the list is empty —
   * unlike the sharing below, which is deliberate.
   */
  it('never collapses two differently named errors onto one code', () => {
    const namesByCode = new Map<string, Set<string>>();

    for (const { className } of declarations) {
      const code = toErrorCode(className);
      namesByCode.set(code, (namesByCode.get(code) ?? new Set()).add(className));
    }

    const collisions = [...namesByCode.entries()]
      .filter(([, names]) => names.size > 1)
      .map(([code, names]) => `${code} <- ${[...names].join(', ')}`);

    expect(collisions).toEqual([]);
  });

  /**
   * The same class name declared in several modules does share a code, and
   * that is on purpose where it happens: three modules each raise
   * `UnknownMaterialReferenceError`, and all three mean "you pointed at a
   * Material that does not exist", so a client treats them alike.
   *
   * Pinned so it stays a decision. A fourth entry here means someone
   * duplicated an error name across modules without asking whether the two
   * really are the same thing to a client — and the contract table has to
   * say so either way.
   */
  it('shares a code across modules only where that is documented', () => {
    const declarationsByCode = new Map<string, number>();

    for (const { className } of declarations) {
      const code = toErrorCode(className);
      declarationsByCode.set(code, (declarationsByCode.get(code) ?? 0) + 1);
    }

    const shared = [...declarationsByCode.entries()]
      .filter(([, count]) => count > 1)
      .map(([code]) => code)
      .sort();

    expect(shared).toEqual(['UNKNOWN_MATERIAL_REFERENCE']);
    expect(contract).toContain('Códigos compartilhados');
  });
});
