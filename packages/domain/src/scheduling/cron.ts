interface CronField {
  values: Set<number>;
  wildcard: boolean;
}

export interface ParsedCronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

const parsePart = (part: string, minimum: number, maximum: number): number[] => {
  const [rangePart, stepPart] = part.split('/');
  if (!rangePart || part.split('/').length > 2) throw new Error(`Invalid cron field: ${part}`);
  const step = stepPart === undefined ? 1 : Number(stepPart);
  if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step: ${part}`);
  let start: number;
  let end: number;
  if (rangePart === '*') {
    start = minimum;
    end = maximum;
  } else if (rangePart.includes('-')) {
    const bounds = rangePart.split('-').map(Number);
    if (bounds.length !== 2 || bounds.some((value) => !Number.isInteger(value)))
      throw new Error(`Invalid cron range: ${part}`);
    [start, end] = bounds as [number, number];
  } else {
    start = Number(rangePart);
    end = stepPart === undefined ? start : maximum;
  }
  if (start < minimum || end > maximum || start > end)
    throw new Error(`Cron value is outside ${minimum}-${maximum}: ${part}`);
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
};

const parseField = (source: string, minimum: number, maximum: number): CronField => {
  const parts = source.split(',');
  if (parts.some((part) => part.length === 0)) throw new Error(`Invalid cron field: ${source}`);
  const values = new Set(parts.flatMap((part) => parsePart(part, minimum, maximum)));
  return { values, wildcard: values.size === maximum - minimum + 1 };
};

export const parseCronExpression = (expression: string): ParsedCronExpression => {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Use a five-field UTC cron expression.');
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const parsedDayOfWeek = parseField(dayOfWeek!, 0, 7);
  if (parsedDayOfWeek.values.delete(7)) parsedDayOfWeek.values.add(0);
  parsedDayOfWeek.wildcard = parsedDayOfWeek.values.size === 7;
  return {
    minute: parseField(minute!, 0, 59),
    hour: parseField(hour!, 0, 23),
    dayOfMonth: parseField(dayOfMonth!, 1, 31),
    month: parseField(month!, 1, 12),
    dayOfWeek: parsedDayOfWeek,
  };
};

const matches = (cron: ParsedCronExpression, candidate: Date): boolean => {
  if (!cron.minute.values.has(candidate.getUTCMinutes())) return false;
  if (!cron.hour.values.has(candidate.getUTCHours())) return false;
  if (!cron.month.values.has(candidate.getUTCMonth() + 1)) return false;
  const dayOfMonthMatches = cron.dayOfMonth.values.has(candidate.getUTCDate());
  const dayOfWeekMatches = cron.dayOfWeek.values.has(candidate.getUTCDay());
  const dayMatches =
    cron.dayOfMonth.wildcard || cron.dayOfWeek.wildcard
      ? dayOfMonthMatches && dayOfWeekMatches
      : dayOfMonthMatches || dayOfWeekMatches;
  return dayMatches;
};

export const nextCronOccurrence = (expression: string, after = new Date()): Date => {
  const cron = parseCronExpression(expression);
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const maximumMinutes = 366 * 24 * 60 * 5;
  for (let index = 0; index < maximumMinutes; index += 1) {
    if (matches(cron, candidate)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new Error('Cron expression has no occurrence in the next five years.');
};
