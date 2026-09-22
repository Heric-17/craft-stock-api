-- A Material now carries the unit it is consumed by, as a closed list of base
-- units: a 1 kg bag of flour is a packageQuantity of 1000 in GRAM, and a 2 L
-- bottle is 2000 in MILLILITER. There is no kilogram, litre or metre, so
-- every quantity in the database -- packageQuantity, stockQuantity,
-- minimumStockAlert, and the quantity of every BomItem that consumes the
-- Material -- means the same thing without any conversion table to keep
-- correct. Showing 1500 g as "1,5 kg" is the interface's business.

CREATE TYPE "ConsumptionUnit" AS ENUM ('UNIT', 'GRAM', 'MILLILITER', 'CENTIMETER');

-- Existing Materials predate the column, and nothing recorded about them says
-- how they are measured: the note's own unit describes how an item was rung
-- up, not how it is consumed, and was never the source for this. UNIT is the
-- assumption that changes no arithmetic -- a quantity of 3 keeps meaning
-- three of whatever the Material is -- and it is an assumption, not a fact.
ALTER TABLE "Material" ADD COLUMN "consumptionUnit" "ConsumptionUnit" NOT NULL DEFAULT 'UNIT';

-- The default exists only to fill the rows that were already here. Leaving it
-- in place would let a Material be created without anyone stating its unit,
-- which is the one thing this column is for.
ALTER TABLE "Material" ALTER COLUMN "consumptionUnit" DROP DEFAULT;

-- Every backfilled row needs a human to confirm or correct it, and a row that
-- was assumed looks exactly like one that was chosen. The list is raised here,
-- while the assumption is being made, because nothing in the schema afterwards
-- can tell the two apart.
DO $$
DECLARE
  assumed_count INTEGER;
  material RECORD;
BEGIN
  SELECT COUNT(*) INTO assumed_count FROM "Material";

  IF assumed_count > 0 THEN
    RAISE WARNING 'consumptionUnit: % existing Material(s) were assumed to be UNIT and must be reviewed by hand. A Material bought by the kilo or by the litre is wrong until someone says so.', assumed_count;

    FOR material IN SELECT "id", "name", "packageQuantity" FROM "Material" ORDER BY "name" LOOP
      RAISE WARNING 'consumptionUnit review: % (id %, packageQuantity %)', material."name", material."id", material."packageQuantity";
    END LOOP;
  END IF;
END $$;
