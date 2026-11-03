// Original synthetic examples. No model, project code, or external service.
export const before = () => ({ money: { cents: 1250 }, totalMinor: () => 1250 });
export const after = () => ({ amount: { minorUnits: 1250 }, totalMinor: () => 1250 });
export const internalConsumer = invoice => invoice.money.cents.toString();
export const publicConsumer = invoice => invoice.totalMinor().toString();
export const cases = [
  { id: 'leak', producer: 'pricing/model.mjs', consumer: 'checkout/receipt.mjs', expected: 'representation-change-breaks-consumer' },
  { id: 'stable-public-contract', expected: 'keep-boundary' },
  { id: 'explicitly-permitted-dependency', rule: 'Receipt may use pricing.totalMinor()', expected: 'keep-boundary' },
  { id: 'unknown-volatility-and-owner', volatility: null, owner: null, expected: 'unknown' },
  { id: 'missing-caller', expected: 'unavailable' },
  { id: 'external-consumer', revision: null, expected: 'unavailable' },
  { id: 'separate-repositories', domainBoundary: null, expected: 'unknown' },
];
