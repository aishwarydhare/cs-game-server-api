export function isPositiveEven(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n % 2 === 0;
}
