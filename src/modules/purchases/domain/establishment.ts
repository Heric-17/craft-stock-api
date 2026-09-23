import { InvalidPurchaseError } from './purchase.error';

export interface EstablishmentProps {
  name: string;
  /** As the note prints it, punctuation included. Null for a purchase entered by hand. */
  cnpj: string | null;
}

/**
 * The shop a `Purchase` was made at.
 *
 * It is a value on the purchase and not an entity of its own: nothing in the
 * system needs a shop to exist before it is bought from, and a registry of
 * establishments would have to be kept in step with notes that arrive naming
 * whatever the till printed.
 */
export class Establishment {
  readonly name: string;
  readonly cnpj: string | null;

  constructor(props: EstablishmentProps) {
    const name = props.name.trim();

    if (name.length === 0) {
      throw new InvalidPurchaseError('Establishment name must not be empty.');
    }

    this.name = name;
    this.cnpj = props.cnpj === null ? null : props.cnpj.trim();
  }

  /**
   * What the spending dataset groups by and what the listing filters on.
   *
   * The CNPJ when there is one, because a shop keeps it while its trading
   * name changes, and two notes from the same branch must land in the same
   * bucket. A purchase entered by hand has no CNPJ and falls back to the
   * name the user typed, which is the only identity it has.
   */
  get id(): string {
    return this.cnpj ?? this.name;
  }

  equals(other: Establishment): boolean {
    return this.id === other.id;
  }
}

/**
 * The same identity rule, applied to a pair of raw values.
 *
 * Both the Prisma adapter and the in-memory fake group rows by it, and they
 * must group them the same way — so the rule lives here, once, rather than
 * being restated in each of them.
 */
export function establishmentIdOf(name: string | null, cnpj: string | null): string | null {
  if (cnpj !== null && cnpj.trim().length > 0) {
    return cnpj.trim();
  }

  if (name !== null && name.trim().length > 0) {
    return name.trim();
  }

  return null;
}
