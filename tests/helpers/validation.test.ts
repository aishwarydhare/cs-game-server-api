import { isPositiveEven } from '../../src/helpers/validation';

describe('isPositiveEven', () => {
  it.each([2, 4, 8, 16, 100])('accepts positive even %i', (n) => {
    expect(isPositiveEven(n)).toBe(true);
  });

  it.each([0, -2, 1, 3, 7, 2.5, Number.NaN])('rejects %p', (n) => {
    expect(isPositiveEven(n)).toBe(false);
  });
});
