import type { EmiRangeResult, EmiResult } from "../../types/domain";

export function calculateEmi(principal: number, annualRate: number, tenureMonths: number): EmiResult {
  const monthlyRate = annualRate / 12 / 100;

  let monthlyEmi = 0;
  if (monthlyRate === 0) {
    monthlyEmi = principal / tenureMonths;
  } else {
    monthlyEmi =
      (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
      (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  }

  const totalPayable = monthlyEmi * tenureMonths;
  const totalInterest = totalPayable - principal;

  return {
    principal,
    annualRate,
    tenureMonths,
    monthlyEmi: Number(monthlyEmi.toFixed(2)),
    totalInterest: Number(totalInterest.toFixed(2)),
    totalPayable: Number(totalPayable.toFixed(2)),
  };
}

export function estimateEmiRange(
  principal: number,
  minRate: number,
  maxRate: number,
  minTenureMonths: number,
  maxTenureMonths: number,
): EmiRangeResult {
  const lowestEmiResult = calculateEmi(principal, minRate, maxTenureMonths);
  const highestEmiResult = calculateEmi(principal, maxRate, minTenureMonths);

  return {
    minRate,
    maxRate,
    minTenureMonths,
    maxTenureMonths,
    minEmi: lowestEmiResult.monthlyEmi,
    maxEmi: highestEmiResult.monthlyEmi,
  };
}
