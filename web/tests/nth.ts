/**
 * `xs[i]`, but a missing item throws naming the index instead of handing back `undefined`
 * (V9: `noUncheckedIndexedAccess`). In a test, reading `calls[0]` is already an expectation.
 */
export function nth<T>(xs: ArrayLike<T>, i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`expected an item at [${i}], got ${xs.length}`);
  return x;
}
