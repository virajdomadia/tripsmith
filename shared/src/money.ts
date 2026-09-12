/** Integer paise → "₹14,999" (en-IN grouping, no decimals). */
export function formatInr(paise: number): string {
  const rupees = Math.round(paise / 100);
  return '₹' + rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** Seed content is written in rupees for readability; the DB stores paise. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isInteger(rupees) || rupees < 0) {
    throw new Error(`rupees must be a non-negative integer, got ${rupees}`);
  }
  return rupees * 100;
}
