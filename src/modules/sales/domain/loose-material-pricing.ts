import { applyMargin } from '../../../shared/domain/money/margin';
import type { Money } from '../../../shared/domain/money/money';
import { InvalidSaleError } from './sale.error';

/**
 * What one whole package of a loose Material ("avulso") sells for:
 * `packageCost × (10 000 + marginBasisPoints) ÷ 10 000`, rounded once. It is
 * the same markup `CompositeProduct` pricing applies, through the same
 * function, so the two cannot drift apart.
 *
 * The result is the `priceBasisAmount` of the `SaleItem`, paired with the
 * Material's `packageQuantity` — the package price is kept whole rather than
 * divided down to a price per gram, because that division is exactly what
 * loses the money. See `SaleItem.lineTotal`.
 *
 * `marginBasisPoints` mirrors `CompositeProduct.profitMarginBasisPoints`:
 * whole basis points, `5000` for 50%. It is asked for at the point of sale
 * instead of being a column on `Material`, because selling an input on its own
 * is rare and a stored margin would have to be maintained on every Material
 * for the few that are ever sold this way.
 *
 * Zero is a valid margin and sells at cost. It is never assumed, though — the
 * caller has to say so, since a silently defaulted zero sells at cost while
 * looking like a priced sale.
 */
export function calculateLooseMaterialPriceBasis(
  packageCost: Money,
  marginBasisPoints: number,
): Money {
  if (!Number.isInteger(marginBasisPoints) || marginBasisPoints < 0) {
    throw new InvalidSaleError(
      'SaleItem marginBasisPoints must be a whole number of basis points greater than or equal to zero.',
    );
  }

  return applyMargin(packageCost, marginBasisPoints);
}
