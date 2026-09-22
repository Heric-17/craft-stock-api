/**
 * The unit a `Material` is consumed by, as a closed list of base units only.
 *
 * There is no kilogram, no litre and no metre on purpose. A 1 kg bag of
 * flour is a `packageQuantity` of 1000 in `GRAM`, and a 2 L bottle is 2000 in
 * `MILLILITER`. Every persisted quantity — `stockQuantity`,
 * `packageQuantity`, a `BomItem`'s quantity — therefore means the same thing
 * regardless of how the item was bought, and the system needs no conversion
 * table to compare them. A conversion table is where this kind of model rots:
 * one factor wrong, or one quantity stored in the unit it was typed in rather
 * than the unit it is kept in, and the error is silent and everywhere.
 *
 * Reading 1500 g back as "1,5 kg" is a display decision and belongs to the
 * interface, which can format whatever it likes without any of it reaching
 * the database.
 */
export const CONSUMPTION_UNITS = ['UNIT', 'GRAM', 'MILLILITER', 'CENTIMETER'] as const;

export type ConsumptionUnit = (typeof CONSUMPTION_UNITS)[number];

/**
 * The symbol each unit is written with, shipped in the response DTOs next to
 * every quantity.
 *
 * It travels with the data rather than being rebuilt by each client, so the
 * symbols cannot drift away from the list above — a client keeping its own
 * table would keep showing "g" for a unit this list had meanwhile changed.
 */
const SYMBOLS: Record<ConsumptionUnit, string> = {
  UNIT: 'un',
  GRAM: 'g',
  MILLILITER: 'ml',
  CENTIMETER: 'cm',
};

export function consumptionUnitSymbol(unit: ConsumptionUnit): string {
  return SYMBOLS[unit];
}

export function isConsumptionUnit(value: string): value is ConsumptionUnit {
  return (CONSUMPTION_UNITS as readonly string[]).includes(value);
}
