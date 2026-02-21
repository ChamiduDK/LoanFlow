export function calculateEmi(principal: number, annualRate: number, tenureMonths: number): number {
  const safePrincipal = Math.max(0, principal);
  const safeRate = Math.max(0, annualRate);
  const safeTenure = Math.max(1, tenureMonths);

  const monthlyRate = safeRate / 12 / 100;
  if (monthlyRate === 0) {
    return Math.round(safePrincipal / safeTenure);
  }

  const emi =
    (safePrincipal * monthlyRate * Math.pow(1 + monthlyRate, safeTenure)) /
    (Math.pow(1 + monthlyRate, safeTenure) - 1);

  return Math.round(emi);
}
