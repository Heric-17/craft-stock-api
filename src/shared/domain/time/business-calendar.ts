export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function partsOf(date: Date): { year: string; month: string; day: string } {
  const parts = dateParts.formatToParts(date);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';

  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function businessDayOf(date: Date): string {
  const { year, month, day } = partsOf(date);

  return `${year}-${month}-${day}`;
}

export function businessMonthOf(date: Date): string {
  const { year, month } = partsOf(date);

  return `${year}-${month}`;
}

export function businessMonthsIn(from: Date, to: Date): string[] {
  if (to.getTime() <= from.getTime()) {
    return [];
  }

  const first = businessMonthOf(from);
  const last = businessMonthOf(new Date(to.getTime() - 1));
  const months: string[] = [];

  let [year, month] = first.split('-').map(Number) as [number, number];

  for (;;) {
    const label = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    months.push(label);

    if (label >= last) {
      return months;
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}
