import { InvalidCompositeProductError } from './composite-product.error';
import { BillOfMaterials } from './bill-of-materials.entity';
import { BomItem } from './bom-item.entity';

describe('BillOfMaterials', () => {
  it('builds with its BomItems', () => {
    const bom = new BillOfMaterials({
      id: 'bom-1',
      compositeProductId: 'product-1',
      items: [
        new BomItem({
          id: 'item-1',
          billOfMaterialsId: 'bom-1',
          materialId: 'flour',
          quantity: 120,
        }),
        new BomItem({
          id: 'item-2',
          billOfMaterialsId: 'bom-1',
          materialId: 'sugar',
          quantity: 60,
        }),
      ],
    });

    expect(bom.items).toHaveLength(2);
  });

  it('rejects the same Material referenced more than once', () => {
    expect(
      () =>
        new BillOfMaterials({
          id: 'bom-1',
          compositeProductId: 'product-1',
          items: [
            new BomItem({
              id: 'item-1',
              billOfMaterialsId: 'bom-1',
              materialId: 'flour',
              quantity: 120,
            }),
            new BomItem({
              id: 'item-2',
              billOfMaterialsId: 'bom-1',
              materialId: 'flour',
              quantity: 60,
            }),
          ],
        }),
    ).toThrow(InvalidCompositeProductError);
  });
});
