import { Money } from '../../../shared/domain/money/money';
import {
  allocateDiscount,
  eligibleLines,
  sumAllocations,
  type DiscountAllocationLine,
} from './discount-allocation';
import { DISCOUNT_ALLOCATION_MODES } from './discount-allocation-mode';
import { DiscountAllocationError } from './purchase.error';

function line(id: string, gross: string, isCompanyExpense = true): DiscountAllocationLine {
  return { id, grossValue: Money.fromDecimalString(gross), isCompanyExpense };
}

const money = (value: string): Money => Money.fromDecimalString(value);

describe('allocateDiscount', () => {
  /**
   * The invariant that has to hold whatever the user chose: what is
   * attributed adds up to exactly what the note discounted. A spending panel
   * that sums the lines can then never drift from the note's own total.
   */
  describe('the attributed amounts close with discountTotal, in every mode', () => {
    const lines = [line('a', '20.00', true), line('b', '100.00', false), line('c', '33.33', true)];

    it.each(DISCOUNT_ALLOCATION_MODES)('%s', (mode) => {
      const discount = money('7.77');
      const manual =
        mode === 'MANUAL'
          ? new Map([
              ['a', money('1.11')],
              ['b', money('5.00')],
              ['c', money('1.66')],
            ])
          : undefined;

      const allocated = allocateDiscount(lines, discount, mode, manual);

      expect(sumAllocations(allocated).toDecimalString()).toBe(discount.toDecimalString());
    });
  });

  it('never attributes more discount to a line than the line is worth', () => {
    const lines = [line('small', '0.01'), line('big', '999.99')];
    const allocated = allocateDiscount(lines, money('500.00'), 'PROPORTIONAL');

    for (const entry of allocated) {
      const source = lines.find((candidate) => candidate.id === entry.id) as DiscountAllocationLine;
      expect(entry.allocatedDiscount.isGreaterThan(source.grossValue)).toBe(false);
    }
  });

  /**
   * The residue of rounding each line independently lands on the largest
   * eligible line, where a cent weighs least relatively.
   */
  it('throws the rounding residue at the largest eligible line', () => {
    const lines = [line('a', '10.00'), line('b', '10.00'), line('c', '70.00')];
    const allocated = allocateDiscount(lines, money('0.01'), 'PROPORTIONAL');

    expect(allocated.find((entry) => entry.id === 'c')?.allocatedDiscount.toDecimalString()).toBe(
      '0.01',
    );
    expect(sumAllocations(allocated).toDecimalString()).toBe('0.01');
  });

  describe('a note with no discount', () => {
    /**
     * The choice never appears: every line is zero and the user is not asked.
     */
    it.each(DISCOUNT_ALLOCATION_MODES)('gives every line zero under %s', (mode) => {
      const allocated = allocateDiscount(
        [line('a', '20.00', true), line('b', '100.00', false)],
        Money.zero(),
        mode,
      );

      expect(allocated.every((entry) => entry.allocatedDiscount.isZero())).toBe(true);
    });
  });

  describe('PROPORTIONAL', () => {
    it('spreads over every line in proportion to its gross value', () => {
      const allocated = allocateDiscount(
        [line('a', '30.00'), line('b', '70.00')],
        money('10.00'),
        'PROPORTIONAL',
      );

      expect(allocated[0].allocatedDiscount.toDecimalString()).toBe('3.00');
      expect(allocated[1].allocatedDiscount.toDecimalString()).toBe('7.00');
    });
  });

  describe('COMPANY_ONLY', () => {
    /**
     * The case the whole feature exists for: flour at 20 (company), wine at
     * 100 (personal), 20 of discount granted on the wine. A proportional
     * spread would claim the company spent 16.67 on flour when it spent 20.
     */
    it('leaves personal lines untouched', () => {
      const allocated = allocateDiscount(
        [line('flour', '20.00', true), line('wine', '100.00', false)],
        money('10.00'),
        'COMPANY_ONLY',
      );

      expect(allocated[0].allocatedDiscount.toDecimalString()).toBe('10.00');
      expect(allocated[1].allocatedDiscount.isZero()).toBe(true);
    });

    it('is refused when there is no company line to carry the discount', () => {
      expect(() =>
        allocateDiscount([line('wine', '100.00', false)], money('10.00'), 'COMPANY_ONLY'),
      ).toThrow(DiscountAllocationError);
      expect(() =>
        allocateDiscount([line('wine', '100.00', false)], money('10.00'), 'COMPANY_ONLY'),
      ).toThrow(/no eligible line/);
    });
  });

  describe('PERSONAL_ONLY', () => {
    it('leaves company lines untouched', () => {
      const allocated = allocateDiscount(
        [line('flour', '20.00', true), line('wine', '100.00', false)],
        money('20.00'),
        'PERSONAL_ONLY',
      );

      expect(allocated[0].allocatedDiscount.isZero()).toBe(true);
      expect(allocated[1].allocatedDiscount.toDecimalString()).toBe('20.00');
    });

    it('is refused when there is no personal line to carry the discount', () => {
      expect(() =>
        allocateDiscount([line('flour', '20.00', true)], money('5.00'), 'PERSONAL_ONLY'),
      ).toThrow(DiscountAllocationError);
    });
  });

  describe('MANUAL', () => {
    it('takes exactly what the user typed', () => {
      const allocated = allocateDiscount(
        [line('a', '20.00'), line('b', '100.00')],
        money('15.00'),
        'MANUAL',
        new Map([
          ['a', money('2.00')],
          ['b', money('13.00')],
        ]),
      );

      expect(allocated[0].allocatedDiscount.toDecimalString()).toBe('2.00');
      expect(allocated[1].allocatedDiscount.toDecimalString()).toBe('13.00');
    });

    /**
     * There is nothing to recompute in MANUAL — the amounts are the user's
     * input and derive from nothing — so a sum that does not close is refused
     * rather than adjusted.
     */
    it('is refused when the amounts do not add up to the note discount', () => {
      expect(() =>
        allocateDiscount(
          [line('a', '20.00'), line('b', '100.00')],
          money('15.00'),
          'MANUAL',
          new Map([
            ['a', money('2.00')],
            ['b', money('12.00')],
          ]),
        ),
      ).toThrow(DiscountAllocationError);
    });

    it('is refused when a line is given more discount than it is worth', () => {
      expect(() =>
        allocateDiscount(
          [line('a', '20.00'), line('b', '100.00')],
          money('50.00'),
          'MANUAL',
          new Map([
            ['a', money('50.00')],
            ['b', money('0.00')],
          ]),
        ),
      ).toThrow(/exceeds the line's gross value/);
    });

    it('is refused when no amounts were given at all', () => {
      expect(() => allocateDiscount([line('a', '20.00')], money('5.00'), 'MANUAL')).toThrow(
        DiscountAllocationError,
      );
    });

    it('does not depend on the eligible set: a personal line may take discount', () => {
      const allocated = allocateDiscount(
        [line('a', '20.00', true), line('b', '100.00', false)],
        money('5.00'),
        'MANUAL',
        new Map([['b', money('5.00')]]),
      );

      expect(allocated[1].allocatedDiscount.toDecimalString()).toBe('5.00');
    });
  });

  it('refuses a discount larger than what the eligible lines are worth', () => {
    expect(() =>
      allocateDiscount([line('a', '10.00', true)], money('50.00'), 'COMPANY_ONLY'),
    ).toThrow(/no line may take more discount than it is worth/);
  });

  it('refuses a discount on a purchase with no lines', () => {
    expect(() => allocateDiscount([], money('5.00'), 'PROPORTIONAL')).toThrow(
      DiscountAllocationError,
    );
  });

  /**
   * The refusals above are all one `code`, so what tells the screen which
   * rule broke — and which numbers to show the user — is the payload. The
   * amounts travel as decimal strings, never as JSON numbers: showing
   * someone the figure that did not add up is the whole purpose, and a float
   * would corrupt it on the way out.
   */
  describe('the refusal it reports', () => {
    function refusalOf(run: () => unknown): DiscountAllocationError {
      try {
        run();
      } catch (error) {
        return error as DiscountAllocationError;
      }

      throw new Error('allocateDiscount was expected to throw.');
    }

    it('reports a manual sum that does not close, with both figures', () => {
      const error = refusalOf(() =>
        allocateDiscount(
          [line('a', '20.00'), line('b', '100.00')],
          money('15.00'),
          'MANUAL',
          new Map([
            ['a', money('2.00')],
            ['b', money('12.00')],
          ]),
        ),
      );

      expect(error.code).toBe('DISCOUNT_ALLOCATION');
      expect(error.details).toEqual({
        reason: 'SUM_MISMATCH',
        expected: '15.00',
        provided: '14.00',
        mode: 'MANUAL',
      });
    });

    it('reports which line took more than it is worth, and its ceiling', () => {
      const error = refusalOf(() =>
        allocateDiscount(
          [line('a', '20.00'), line('b', '100.00')],
          money('50.00'),
          'MANUAL',
          new Map([
            ['a', money('50.00')],
            ['b', money('0.00')],
          ]),
        ),
      );

      expect(error.details).toEqual({
        reason: 'LINE_EXCEEDS_GROSS',
        itemId: 'a',
        expected: '20.00',
        provided: '50.00',
        mode: 'MANUAL',
      });
    });

    it('reports a mode with no eligible line, naming the mode', () => {
      const error = refusalOf(() =>
        allocateDiscount([line('wine', '100.00', false)], money('10.00'), 'COMPANY_ONLY'),
      );

      expect(error.details).toEqual({
        reason: 'NO_ELIGIBLE_LINE',
        mode: 'COMPANY_ONLY',
        expected: '10.00',
      });
    });

    it('reports a discount larger than the lines it would come off', () => {
      const error = refusalOf(() =>
        allocateDiscount([line('a', '10.00', true)], money('50.00'), 'COMPANY_ONLY'),
      );

      expect(error.details).toEqual({
        reason: 'DISCOUNT_EXCEEDS_GROSS',
        mode: 'COMPANY_ONLY',
        expected: '10.00',
        provided: '50.00',
      });
    });

    it('reports MANUAL chosen with no amounts at all', () => {
      const error = refusalOf(() =>
        allocateDiscount([line('a', '20.00')], money('5.00'), 'MANUAL'),
      );

      expect(error.details).toMatchObject({ reason: 'MANUAL_INPUT_MISSING', mode: 'MANUAL' });
    });

    it('reports a negative amount typed for a line', () => {
      const error = refusalOf(() =>
        allocateDiscount(
          [line('a', '20.00')],
          money('5.00'),
          'MANUAL',
          new Map([['a', money('-1.00')]]),
        ),
      );

      expect(error.details).toMatchObject({ reason: 'NEGATIVE_LINE_AMOUNT', itemId: 'a' });
    });

    it('reports a negative discount on the note itself', () => {
      const error = refusalOf(() =>
        allocateDiscount([line('a', '20.00')], money('-5.00'), 'PROPORTIONAL'),
      );

      expect(error.details).toMatchObject({ reason: 'NEGATIVE_DISCOUNT_TOTAL' });
    });

    it('reports a discount with no line to carry it', () => {
      const error = refusalOf(() => allocateDiscount([], money('5.00'), 'PROPORTIONAL'));

      expect(error.details).toEqual({ reason: 'NO_LINES', expected: '5.00' });
    });

    /** Every amount in the payload is a decimal string, per §8.1. */
    it('never puts a JSON number where money belongs', () => {
      const error = refusalOf(() =>
        allocateDiscount([line('a', '10.00', true)], money('50.00'), 'COMPANY_ONLY'),
      );

      expect(typeof error.details?.expected).toBe('string');
      expect(typeof error.details?.provided).toBe('string');
    });
  });
});

describe('eligibleLines', () => {
  const lines = [line('a', '1.00', true), line('b', '1.00', false)];

  it('is every line under PROPORTIONAL and MANUAL', () => {
    expect(eligibleLines(lines, 'PROPORTIONAL')).toHaveLength(2);
    expect(eligibleLines(lines, 'MANUAL')).toHaveLength(2);
  });

  it('is the company lines under COMPANY_ONLY', () => {
    expect(eligibleLines(lines, 'COMPANY_ONLY').map((l) => l.id)).toEqual(['a']);
  });

  it('is the personal lines under PERSONAL_ONLY', () => {
    expect(eligibleLines(lines, 'PERSONAL_ONLY').map((l) => l.id)).toEqual(['b']);
  });
});
