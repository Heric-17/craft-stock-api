import { calculateMaterialNeed, type SaleItemNeedInput } from './material-need';

describe('calculateMaterialNeed', () => {
  it('sums a loose-Material ("avulso") SaleItem quantity directly', () => {
    const items: SaleItemNeedInput[] = [
      { compositeProductId: null, materialId: 'flour', quantity: 3 },
    ];

    const need = calculateMaterialNeed(items, new Map());

    expect(need.get('flour')).toBe(3);
  });

  it('multiplies bomItem.quantity by saleItem.quantity for a CompositeProduct SaleItem', () => {
    const items: SaleItemNeedInput[] = [
      { compositeProductId: 'cake', materialId: null, quantity: 3 },
    ];
    const bomByCompositeProductId = new Map([['cake', [{ materialId: 'flour', quantity: 120 }]]]);

    const need = calculateMaterialNeed(items, bomByCompositeProductId);

    expect(need.get('flour')).toBe(360);
  });

  it('aggregates the same Material across multiple SaleItems, composite and loose alike', () => {
    const items: SaleItemNeedInput[] = [
      { compositeProductId: 'cake', materialId: null, quantity: 2 }, // 2 x 120 = 240 flour
      { compositeProductId: null, materialId: 'flour', quantity: 60 }, // + 60 flour avulso
    ];
    const bomByCompositeProductId = new Map([['cake', [{ materialId: 'flour', quantity: 120 }]]]);

    const need = calculateMaterialNeed(items, bomByCompositeProductId);

    expect(need.get('flour')).toBe(300);
  });

  it('expands every BomItem of a CompositeProduct with multiple Materials', () => {
    const items: SaleItemNeedInput[] = [
      { compositeProductId: 'cake', materialId: null, quantity: 2 },
    ];
    const bomByCompositeProductId = new Map([
      [
        'cake',
        [
          { materialId: 'flour', quantity: 120 },
          { materialId: 'sugar', quantity: 60 },
        ],
      ],
    ]);

    const need = calculateMaterialNeed(items, bomByCompositeProductId);

    expect(need.get('flour')).toBe(240);
    expect(need.get('sugar')).toBe(120);
  });

  it('returns an empty map for no items', () => {
    const need = calculateMaterialNeed([], new Map());

    expect(need.size).toBe(0);
  });
});
