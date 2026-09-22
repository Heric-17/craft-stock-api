-- A SaleItem now freezes the price as the fraction it really is -- an amount
-- and the quantity that amount refers to -- instead of the per-unit figure
-- that fraction divides out to.
--
-- The old unitPriceSnapshot was a Decimal(12,2): whole cents. A loose Material
-- sold in its base unit costs a fraction of a cent per unit, and that does not
-- fit: flour at R$ 28,00 the kilo is R$ 0,028 per gram, stored as R$ 0,03, and
-- 120 g of it then sold for R$ 3,60 instead of R$ 3,36. Keeping the package
-- amount undivided and dividing only when a line total is computed -- once,
-- multiplying before dividing -- is what makes the frozen price exact.

-- The amount is a straight rename: for a CompositeProduct line, the frozen
-- finalPrice is already the amount for a basis quantity of one, so existing
-- data carries over exactly rather than being approximated.
ALTER TABLE "SaleItem" RENAME COLUMN "unitPriceSnapshot" TO "priceBasisAmount";

-- Every existing row's amount refers to one unit, so 1 is the value that keeps
-- the line total it already displayed. Added with the default and then
-- stripped of it, so no row can be created later without stating its basis.
ALTER TABLE "SaleItem" ADD COLUMN "priceBasisQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1;
ALTER TABLE "SaleItem" ALTER COLUMN "priceBasisQuantity" DROP DEFAULT;

-- Retroactive approximation, raised here because nothing in the schema
-- afterwards can distinguish a line created before this migration from one
-- created after it.
--
-- Loose-Material lines that already exist carry two defects this migration
-- cannot repair, and deliberately does not try to:
--
--   1. The old rounding. Their priceBasisAmount is the per-unit price as it
--      was stored, already flattened to whole cents. Recomputing it from the
--      Material's current packageCost would be worse, not better: it would
--      overwrite a historical snapshot with today's cost, which is the one
--      thing the snapshot exists to prevent.
--   2. No margin. They were sold at cost, because there was no margin to
--      state when they were created. A margin invented now would be a number
--      nobody chose.
--
-- Both stay as they are. The list below exists so the rows that carry them can
-- be recognised by hand.
DO $$
DECLARE
  loose_count INTEGER;
  line RECORD;
BEGIN
  SELECT COUNT(*) INTO loose_count FROM "SaleItem" WHERE "materialId" IS NOT NULL;

  IF loose_count > 0 THEN
    RAISE WARNING 'priceBasisQuantity: % existing loose-Material SaleItem line(s) keep the old per-unit rounding and no margin, as a retroactive approximation. Their line totals are unchanged by this migration.', loose_count;

    FOR line IN
      SELECT "id", "saleId", "itemNameSnapshot", "priceBasisAmount"
      FROM "SaleItem"
      WHERE "materialId" IS NOT NULL
      ORDER BY "saleId", "itemNameSnapshot"
    LOOP
      RAISE WARNING 'priceBasisQuantity approximation: SaleItem % on Sale % (%, priceBasisAmount %) sold at cost, per unit, rounded to the cent.', line."id", line."saleId", line."itemNameSnapshot", line."priceBasisAmount";
    END LOOP;
  END IF;
END $$;
