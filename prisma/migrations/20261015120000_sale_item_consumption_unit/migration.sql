-- A SaleItem now freezes the unit its quantities are expressed in, next to the
-- price it already freezes. `quantity` and `priceBasisQuantity` are in the
-- Material's consumptionUnit, and that unit can change after the sale: the lock
-- on it only looks at stock and bills of materials, not at sales. Without the
-- snapshot an old sale would be read in the new unit with no error at all.

-- Added nullable so existing rows can be filled before the constraint applies.
ALTER TABLE "SaleItem" ADD COLUMN "consumptionUnit" "ConsumptionUnit";

-- A loose-Material line takes the unit the Material has now. It is the best
-- information available for rows created before this column existed: the
-- unit is only locked against change while there is stock or a bill of
-- materials, so a history that predates the snapshot may already be affected,
-- and nothing in the data says otherwise.
UPDATE "SaleItem" AS si
SET "consumptionUnit" = m."consumptionUnit"
FROM "Material" AS m
WHERE si."materialId" = m."id";

-- A CompositeProduct is sold by the piece.
UPDATE "SaleItem"
SET "consumptionUnit" = 'UNIT'
WHERE "compositeProductId" IS NOT NULL;

ALTER TABLE "SaleItem" ALTER COLUMN "consumptionUnit" SET NOT NULL;
