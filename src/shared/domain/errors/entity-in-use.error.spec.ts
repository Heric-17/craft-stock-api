import {
  EntityInUseError,
  totalReferences,
  type EntityReferenceCounts,
} from './entity-in-use.error';

const NONE: EntityReferenceCounts = {
  saleItems: 0,
  bomItems: 0,
  purchaseItems: 0,
  stockMovements: 0,
};

describe('totalReferences', () => {
  it('is zero when nothing points at the entity', () => {
    expect(totalReferences(NONE)).toBe(0);
  });

  it('sums every kind', () => {
    expect(
      totalReferences({ saleItems: 1, bomItems: 2, purchaseItems: 3, stockMovements: 4 }),
    ).toBe(10);
  });
});

describe('EntityInUseError', () => {
  it('publishes the stable code', () => {
    const error = new EntityInUseError('Material', 'mat-1', { ...NONE, bomItems: 2 });

    expect(error.code).toBe('ENTITY_IN_USE');
  });

  /**
   * The breakdown is the point: "used by 2 recipes" and "sold twice" need
   * different wording and offer different ways out, and a single total
   * cannot tell them apart.
   */
  it('carries the count of each kind of reference, plus the total', () => {
    const error = new EntityInUseError('Material', 'mat-1', {
      saleItems: 3,
      bomItems: 2,
      purchaseItems: 1,
      stockMovements: 0,
    });

    expect(error.details).toEqual({
      entityName: 'Material',
      entityId: 'mat-1',
      saleItems: 3,
      bomItems: 2,
      purchaseItems: 1,
      stockMovements: 0,
      total: 6,
    });
  });

  it('names the entity and the total in the message, for the log', () => {
    const error = new EntityInUseError('CompositeProduct', 'prod-9', { ...NONE, saleItems: 4 });

    expect(error.message).toContain('CompositeProduct prod-9');
    expect(error.message).toContain('4');
  });

  it('keeps the class name, which is what the status map matches on', () => {
    expect(new EntityInUseError('Material', 'mat-1', NONE).name).toBe('EntityInUseError');
  });
});
