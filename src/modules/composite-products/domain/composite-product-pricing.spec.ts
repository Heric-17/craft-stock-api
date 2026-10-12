import { applyMargin } from '../../../shared/domain/money/margin';
import { Money } from '../../../shared/domain/money/money';
import {
  calculateBomItemCost,
  calculateCompositeProductPricing,
  calculateMaterialsCost,
  type CompositeProductPricingInput,
} from './composite-product-pricing';

describe('calculateMaterialsCost', () => {
  it('computes the cost of a single-Material recipe', () => {
    const cost = calculateMaterialsCost([
      { quantity: 120, packageCost: Money.fromDecimalString('20.00'), packageQuantity: 1000 },
    ]);

    expect(cost.toDecimalString()).toBe('2.40');
  });

  it('sums the cost across multiple Materials', () => {
    const cost = calculateMaterialsCost([
      { quantity: 120, packageCost: Money.fromDecimalString('20.00'), packageQuantity: 1000 },
      { quantity: 60, packageCost: Money.fromDecimalString('30.00'), packageQuantity: 1000 },
      { quantity: 2, packageCost: Money.fromDecimalString('1.00'), packageQuantity: 1 },
    ]);

    expect(cost.toDecimalString()).toBe('6.20');
  });

  it('is zero for a recipe with no items', () => {
    expect(calculateMaterialsCost([]).isZero()).toBe(true);
  });
});

/**
 * The cases of the pricing contract, as data. The client repeats exactly
 * these cases, so a number changed here has to be changed there: it is how a
 * preview and a saved price come to differ by a cent.
 */
interface FixtureLine {
  packageCost: string;
  quantity: string;
  packageQuantity: string;
}

interface FixtureInput {
  lines: FixtureLine[];
  fixedOperationalCost: string;
  profitMarginBasisPoints: number;
  manualPrice: string | null;
}

interface FixtureExpected {
  lineCosts: string[];
  materialsCost: string;
  totalCost: string;
  suggestedPrice: string;
  finalPrice: string;
}

interface Fixture {
  cases: { name: string; description: string; input: FixtureInput; expected: FixtureExpected }[];
  wrongOrderCases: {
    name: string;
    description: string;
    input: FixtureInput;
    wrongMethod: string;
    wrongSuggestedPrice: string;
    expected: FixtureExpected;
  }[];
}

const fixture: Fixture = {
  cases: [
    {
      name: 'zero-margin-sells-at-cost',
      description: 'Margem 0%: o preço sugerido é o custo total.',
      input: {
        lines: [
          {
            packageCost: '28.00',
            quantity: '120',
            packageQuantity: '1000',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 0,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['3.36'],
        materialsCost: '3.36',
        totalCost: '3.36',
        suggestedPrice: '3.36',
        finalPrice: '3.36',
      },
    },
    {
      name: 'hundred-percent-margin',
      description: 'Margem 100% (10000 bp) dobra o custo.',
      input: {
        lines: [
          {
            packageCost: '28.00',
            quantity: '120',
            packageQuantity: '1000',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 10000,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['3.36'],
        materialsCost: '3.36',
        totalCost: '3.36',
        suggestedPrice: '6.72',
        finalPrice: '6.72',
      },
    },
    {
      name: 'margin-33-33-percent',
      description: 'Margem 33,33% (3333 bp), custo 10,01: 1334,633 ¢ arredonda para 1335 ¢.',
      input: {
        lines: [
          {
            packageCost: '10.01',
            quantity: '1',
            packageQuantity: '1',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 3333,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['10.01'],
        materialsCost: '10.01',
        totalCost: '10.01',
        suggestedPrice: '13.35',
        finalPrice: '13.35',
      },
    },
    {
      name: 'margin-33-33-percent-rounds-down',
      description: 'Margem 33,33%, custo 0,03: 3,9999 ¢ arredonda para 4 ¢.',
      input: {
        lines: [
          {
            packageCost: '0.03',
            quantity: '1',
            packageQuantity: '1',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 3333,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['0.03'],
        materialsCost: '0.03',
        totalCost: '0.03',
        suggestedPrice: '0.04',
        finalPrice: '0.04',
      },
    },
    {
      name: 'fixed-cost-and-exact-tie',
      description:
        'Custo fixo > 0 e margem 35%: 490 ¢ × 1,35 = 661,5 ¢, empate exato, arredonda para longe do zero (662 ¢).',
      input: {
        lines: [
          {
            packageCost: '20.00',
            quantity: '120',
            packageQuantity: '1000',
          },
        ],
        fixedOperationalCost: '2.50',
        profitMarginBasisPoints: 3500,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['2.40'],
        materialsCost: '2.40',
        totalCost: '4.90',
        suggestedPrice: '6.62',
        finalPrice: '6.62',
      },
    },
    {
      name: 'tie-decided-by-the-rule-not-by-float',
      description:
        'Custo 1,25 e margem 34,80%: 168,5 ¢ exatos, vira 169 ¢. Em float 125 × 1,348 dá 168,49999… e vira 168.',
      input: {
        lines: [
          {
            packageCost: '1.25',
            quantity: '1',
            packageQuantity: '1',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 3480,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['1.25'],
        materialsCost: '1.25',
        totalCost: '1.25',
        suggestedPrice: '1.69',
        finalPrice: '1.69',
      },
    },
    {
      name: 'several-lines-with-fixed-cost',
      description:
        'Três linhas (2,40 + 1,80 + 2,00) mais custo fixo 2,50 e margem 25%: 1087,5 ¢ arredonda para 1088 ¢.',
      input: {
        lines: [
          {
            packageCost: '20.00',
            quantity: '120',
            packageQuantity: '1000',
          },
          {
            packageCost: '30.00',
            quantity: '60',
            packageQuantity: '1000',
          },
          {
            packageCost: '1.00',
            quantity: '2',
            packageQuantity: '1',
          },
        ],
        fixedOperationalCost: '2.50',
        profitMarginBasisPoints: 2500,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['2.40', '1.80', '2.00'],
        materialsCost: '6.20',
        totalCost: '8.70',
        suggestedPrice: '10.88',
        finalPrice: '10.88',
      },
    },
    {
      name: 'manual-price-overrides-the-suggestion',
      description: 'O preço manual vence no finalPrice; o sugerido continua calculado.',
      input: {
        lines: [
          {
            packageCost: '20.00',
            quantity: '120',
            packageQuantity: '1000',
          },
        ],
        fixedOperationalCost: '2.50',
        profitMarginBasisPoints: 3500,
        manualPrice: '12.00',
      },
      expected: {
        lineCosts: ['2.40'],
        materialsCost: '2.40',
        totalCost: '4.90',
        suggestedPrice: '6.62',
        finalPrice: '12.00',
      },
    },
    {
      name: 'no-materials-only-fixed-cost',
      description: 'Ficha técnica vazia: o custo fixo sozinho recebe a margem.',
      input: {
        lines: [],
        fixedOperationalCost: '2.50',
        profitMarginBasisPoints: 5000,
        manualPrice: null,
      },
      expected: {
        lineCosts: [],
        materialsCost: '0.00',
        totalCost: '2.50',
        suggestedPrice: '3.75',
        finalPrice: '3.75',
      },
    },
    {
      name: 'largest-margin-the-column-holds',
      description: 'Margem 999,99% (99999 bp), o teto: 1 ¢ × 10,9999 = 10,9999 ¢ vira 11 ¢.',
      input: {
        lines: [
          {
            packageCost: '0.01',
            quantity: '1',
            packageQuantity: '1',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 99999,
        manualPrice: null,
      },
      expected: {
        lineCosts: ['0.01'],
        materialsCost: '0.01',
        totalCost: '0.01',
        suggestedPrice: '0.11',
        finalPrice: '0.11',
      },
    },
  ],
  wrongOrderCases: [
    {
      name: 'unit-cost-rounded-before-multiplying',
      description:
        'Dividir primeiro: 2800 ¢ ÷ 1000 g = 2,8 ¢/g, arredondado para 3 ¢/g; × 120 g = 360 ¢. Certo: multiplicar antes, 2800 × 120 ÷ 1000 = 336 ¢.',
      input: {
        lines: [
          {
            packageCost: '28.00',
            quantity: '120',
            packageQuantity: '1000',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 0,
        manualPrice: null,
      },
      wrongMethod: 'round(packageCost ÷ packageQuantity) × quantity',
      wrongSuggestedPrice: '3.60',
      expected: {
        lineCosts: ['3.36'],
        materialsCost: '3.36',
        totalCost: '3.36',
        suggestedPrice: '3.36',
        finalPrice: '3.36',
      },
    },
    {
      name: 'margin-applied-per-line-then-summed',
      description:
        'Duas linhas de 1,25 e margem 34,80%: 168,5 ¢ por linha arredonda para 169 ¢, somando 338 ¢. Certo: somar o custo (250 ¢) e aplicar a margem uma vez, 337 ¢.',
      input: {
        lines: [
          {
            packageCost: '1.25',
            quantity: '1',
            packageQuantity: '1',
          },
          {
            packageCost: '1.25',
            quantity: '1',
            packageQuantity: '1',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 3480,
        manualPrice: null,
      },
      wrongMethod: 'Σ round(lineCost × (10000 + bp) ÷ 10000)',
      wrongSuggestedPrice: '3.38',
      expected: {
        lineCosts: ['1.25', '1.25'],
        materialsCost: '2.50',
        totalCost: '2.50',
        suggestedPrice: '3.37',
        finalPrice: '3.37',
      },
    },
    {
      name: 'floating-point-factor',
      description:
        'Fator em ponto flutuante: 125 × (1 + 3480 / 10000) é 168,49999999999997 e arredonda para 168 ¢; o valor exato é 168,5 ¢ e arredonda para 169 ¢.',
      input: {
        lines: [
          {
            packageCost: '1.25',
            quantity: '1',
            packageQuantity: '1',
          },
        ],
        fixedOperationalCost: '0.00',
        profitMarginBasisPoints: 3480,
        manualPrice: null,
      },
      wrongMethod: 'Math.round(totalCents * (1 + bp / 10000))',
      wrongSuggestedPrice: '1.68',
      expected: {
        lineCosts: ['1.25'],
        materialsCost: '1.25',
        totalCost: '1.25',
        suggestedPrice: '1.69',
        finalPrice: '1.69',
      },
    },
  ],
};

function toPricingInput(input: FixtureInput): CompositeProductPricingInput {
  return {
    lines: input.lines.map((line) => ({
      packageCost: Money.fromDecimalString(line.packageCost),
      quantity: Number(line.quantity),
      packageQuantity: Number(line.packageQuantity),
    })),
    fixedOperationalCost: Money.fromDecimalString(input.fixedOperationalCost),
    profitMarginBasisPoints: input.profitMarginBasisPoints,
    manualPrice: input.manualPrice === null ? null : Money.fromDecimalString(input.manualPrice),
  };
}

describe('calculateCompositeProductPricing', () => {
  it('has at least eight cases in the contract, including the ones the spec promises', () => {
    const names = fixture.cases.map((entry) => entry.name);

    expect(fixture.cases.length).toBeGreaterThanOrEqual(8);
    expect(names).toEqual(
      expect.arrayContaining([
        'zero-margin-sells-at-cost',
        'hundred-percent-margin',
        'margin-33-33-percent',
        'fixed-cost-and-exact-tie',
      ]),
    );
    expect(fixture.wrongOrderCases.length).toBeGreaterThanOrEqual(1);
  });

  it.each(fixture.cases.map((entry) => [entry.name, entry] as const))(
    'matches the contract: %s',
    (_name, entry) => {
      const input = toPricingInput(entry.input);

      const pricing = calculateCompositeProductPricing(input);

      expect(
        input.lines.map((line) =>
          calculateBomItemCost(
            line.packageCost,
            line.quantity,
            line.packageQuantity,
          ).toDecimalString(),
        ),
      ).toEqual(entry.expected.lineCosts);
      expect(pricing.materialsCost.toDecimalString()).toBe(entry.expected.materialsCost);
      expect(pricing.totalCost.toDecimalString()).toBe(entry.expected.totalCost);
      expect(pricing.suggestedPrice.toDecimalString()).toBe(entry.expected.suggestedPrice);
      expect(pricing.finalPrice.toDecimalString()).toBe(entry.expected.finalPrice);
    },
  );

  describe('the wrong order of operations gives a different price', () => {
    // Each shortcut is written out here so that the number the contract
    // prints as "wrong" is a number someone actually computed.
    const wrongSuggestedPrice: Record<string, (input: CompositeProductPricingInput) => string> = {
      'unit-cost-rounded-before-multiplying': (input) => {
        const [line] = input.lines;

        // R$ 28,00 ÷ 1000 g is R$ 0,028, which a Money can only hold as R$ 0,03.
        return line.packageCost
          .dividedBy(line.packageQuantity)
          .times(line.quantity)
          .toDecimalString();
      },
      'margin-applied-per-line-then-summed': (input) =>
        input.lines
          .reduce(
            (sum, line) =>
              sum.plus(
                applyMargin(
                  calculateBomItemCost(line.packageCost, line.quantity, line.packageQuantity),
                  input.profitMarginBasisPoints,
                ),
              ),
            Money.zero(),
          )
          .toDecimalString(),
      'floating-point-factor': (input) => {
        const totalCents = calculateCompositeProductPricing(input).totalCost.toCents();

        return Money.fromCents(
          Math.round(totalCents * (1 + input.profitMarginBasisPoints / 10_000)),
        ).toDecimalString();
      },
    };

    it.each(fixture.wrongOrderCases.map((entry) => [entry.name, entry] as const))(
      '%s',
      (name, entry) => {
        const input = toPricingInput(entry.input);

        const wrong = wrongSuggestedPrice[name](input);
        const right = calculateCompositeProductPricing(input).suggestedPrice.toDecimalString();

        expect(wrong).toBe(entry.wrongSuggestedPrice);
        expect(right).toBe(entry.expected.suggestedPrice);
        expect(wrong).not.toBe(right);
      },
    );
  });

  describe('against the arithmetic it replaced', () => {
    it('34,80% on R$ 1,25: float said R$ 1,68, the integer formula says R$ 1,69', () => {
      // Old: `totalCost.times(1 + 34.8 / 100)`. That reached `Money.times`,
      // whose `toFixed(6)` already hid the binary fuzz, so the backend itself
      // printed 1,69 before and prints it now. The 1,68 is what the same
      // expression gives in plain floating point — what a client would have
      // computed for its preview.
      expect(Math.round(125 * (1 + 34.8 / 100))).toBe(168);

      const pricing = calculateCompositeProductPricing({
        lines: [{ packageCost: Money.fromDecimalString('1.25'), quantity: 1, packageQuantity: 1 }],
        fixedOperationalCost: Money.zero(),
        profitMarginBasisPoints: 3480,
        manualPrice: null,
      });

      expect(pricing.suggestedPrice.toDecimalString()).toBe('1.69');
    });
  });
});
