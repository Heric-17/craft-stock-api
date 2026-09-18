import { InvalidCompositeProductError } from './composite-product.error';
import { BomItem } from './bom-item.entity';

describe('BomItem', () => {
  it('builds with a positive quantity', () => {
    const item = new BomItem({
      id: 'item-1',
      billOfMaterialsId: 'bom-1',
      materialId: 'material-1',
      quantity: 120,
    });

    expect(item.quantity).toBe(120);
  });

  it('rejects a quantity that is not greater than zero', () => {
    expect(
      () =>
        new BomItem({
          id: 'item-1',
          billOfMaterialsId: 'bom-1',
          materialId: 'material-1',
          quantity: 0,
        }),
    ).toThrow(InvalidCompositeProductError);
  });
});
