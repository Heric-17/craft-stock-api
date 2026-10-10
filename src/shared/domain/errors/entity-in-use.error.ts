import { DomainError } from './domain.error';

/**
 * How many records of each kind point at an entity, which is what decides
 * whether it can be physically deleted (§9).
 *
 * Broken down by kind rather than summed, because the breakdown is what the
 * screen needs to explain the refusal: "used by 3 recipes" and "appears in 3
 * past sales" call for different wording and different next steps, and a
 * single total cannot tell them apart.
 */
export interface EntityReferenceCounts {
  saleItems: number;
  bomItems: number;
  purchaseItems: number;
  stockMovements: number;
}

export interface EntityInUseDetails extends EntityReferenceCounts {
  entityName: string;
  entityId: string;
  /** The sum of the four counts above, so the client never has to add them up. */
  total: number;
}

export function totalReferences(counts: EntityReferenceCounts): number {
  return counts.saleItems + counts.bomItems + counts.purchaseItems + counts.stockMovements;
}

export class EntityInUseError extends DomainError<EntityInUseDetails> {
  constructor(entityName: string, entityId: string, counts: EntityReferenceCounts) {
    const total = totalReferences(counts);

    super(
      `${entityName} ${entityId} cannot be deleted: it is referenced by ${total} other record(s). Discontinue it instead.`,
      { entityName, entityId, ...counts, total },
    );
  }
}
