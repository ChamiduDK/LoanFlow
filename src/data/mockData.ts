export const banks = [
  { id: 1, name: "Bank of Ceylon", shortName: "BOC", logo: "🏦" },
  { id: 2, name: "People's Bank", shortName: "PB", logo: "🏛️" },
  { id: 3, name: "Commercial Bank", shortName: "ComBank", logo: "💼" },
  { id: 4, name: "HNB", shortName: "HNB", logo: "🔷" },
  { id: 5, name: "Sampath Bank", shortName: "Sampath", logo: "🟢" },
  { id: 6, name: "Seylan Bank", shortName: "Seylan", logo: "🔵" },
  { id: 7, name: "NDB", shortName: "NDB", logo: "🟡" },
];

export interface LoanScheme {
  id: number;
  bankId: number;
  bankName: string;
  schemeName: string;
  minAmount: number;
  maxAmount: number;
  interestRateMin: number;
  interestRateMax: number;
  tenureMin: number;
  tenureMax: number;
  collateralRequired: boolean;
  benefits: string[];
  approvalTimeline: string;
  eligibilityScore: number;
  approvalProbability: number;
}

export const loanSchemes: LoanScheme[] = [
  {
    id: 1, bankId: 1, bankName: "Bank of Ceylon",
    schemeName: "BOC SME Plus",
    minAmount: 500000, maxAmount: 25000000,
    interestRateMin: 12.5, interestRateMax: 16.0,
    tenureMin: 12, tenureMax: 60,
    collateralRequired: true,
    benefits: ["Low processing fee", "Flexible repayment", "No hidden charges"],
    approvalTimeline: "5-7 business days",
    eligibilityScore: 85, approvalProbability: 78,
  },
  {
    id: 2, bankId: 2, bankName: "People's Bank",
    schemeName: "Peo SME Assist",
    minAmount: 250000, maxAmount: 15000000,
    interestRateMin: 13.0, interestRateMax: 17.5,
    tenureMin: 6, tenureMax: 48,
    collateralRequired: false,
    benefits: ["No collateral up to 5M", "Quick approval", "Grace period available"],
    approvalTimeline: "3-5 business days",
    eligibilityScore: 92, approvalProbability: 85,
  },
  {
    id: 3, bankId: 3, bankName: "Commercial Bank",
    schemeName: "Biz Growth Loan",
    minAmount: 1000000, maxAmount: 50000000,
    interestRateMin: 11.5, interestRateMax: 15.0,
    tenureMin: 12, tenureMax: 84,
    collateralRequired: true,
    benefits: ["Competitive rates", "Dedicated relationship manager", "Digital banking"],
    approvalTimeline: "7-10 business days",
    eligibilityScore: 78, approvalProbability: 72,
  },
  {
    id: 4, bankId: 4, bankName: "HNB",
    schemeName: "HNB Shilpa",
    minAmount: 500000, maxAmount: 30000000,
    interestRateMin: 12.0, interestRateMax: 15.5,
    tenureMin: 12, tenureMax: 72,
    collateralRequired: true,
    benefits: ["Industry-specific solutions", "Advisory support", "Concessionary rates"],
    approvalTimeline: "5-8 business days",
    eligibilityScore: 80, approvalProbability: 74,
  },
  {
    id: 5, bankId: 5, bankName: "Sampath Bank",
    schemeName: "Sampath Vishwa",
    minAmount: 300000, maxAmount: 20000000,
    interestRateMin: 13.5, interestRateMax: 17.0,
    tenureMin: 6, tenureMax: 60,
    collateralRequired: false,
    benefits: ["Fast processing", "Minimal documentation", "Online application"],
    approvalTimeline: "2-4 business days",
    eligibilityScore: 88, approvalProbability: 82,
  },
];

export interface Application {
  id: string;
  bankName: string;
  schemeName: string;
  amount: number;
  status: "draft" | "applied" | "under_review" | "approved" | "rejected";
  date: string;
  documentsComplete: number;
}

export const recentApplications: Application[] = [
  { id: "APP-2024-001", bankName: "People's Bank", schemeName: "Peo SME Assist", amount: 5000000, status: "under_review", date: "2024-12-15", documentsComplete: 85 },
  { id: "APP-2024-002", bankName: "Commercial Bank", schemeName: "Biz Growth Loan", amount: 15000000, status: "approved", date: "2024-12-10", documentsComplete: 100 },
  { id: "APP-2024-003", bankName: "Sampath Bank", schemeName: "Sampath Vishwa", amount: 3000000, status: "draft", date: "2024-12-18", documentsComplete: 40 },
];

export const installmentHistory = [
  { month: "Jan 2025", amount: 125000, status: "paid" as const, date: "2025-01-05" },
  { month: "Feb 2025", amount: 125000, status: "paid" as const, date: "2025-02-05" },
  { month: "Mar 2025", amount: 125000, status: "pending" as const, date: "2025-03-05" },
  { month: "Apr 2025", amount: 125000, status: "pending" as const, date: "2025-04-05" },
  { month: "May 2025", amount: 125000, status: "pending" as const, date: "2025-05-05" },
];

export const districts = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Monaragala", "Ratnapura", "Kegalle",
];

export const businessTypes = [
  "Sole Proprietorship", "Partnership", "Private Limited Company",
  "Public Limited Company", "Cooperative Society",
];

export const industries = [
  "Agriculture", "Manufacturing", "Retail & Wholesale", "Construction",
  "IT & Technology", "Tourism & Hospitality", "Healthcare",
  "Education", "Transportation", "Food & Beverage", "Textile & Garments",
  "Fisheries", "Other Services",
];

export const loanPurposes = [
  "Working Capital", "Business Expansion", "Machinery & Equipment",
  "Vehicle Purchase", "Property Purchase", "Renovation",
  "Debt Refinancing", "Import/Export Finance", "Other",
];

export const documentTypes = [
  { id: "nic", name: "National Identity Card (NIC)", required: true },
  { id: "br", name: "Business Registration Certificate", required: true },
  { id: "bank_statements", name: "Bank Statements (6 months)", required: true },
  { id: "financial_statements", name: "Financial Statements", required: true },
  { id: "collateral_docs", name: "Collateral Documents", required: false },
  { id: "tax_returns", name: "Tax Returns", required: false },
  { id: "utility_bills", name: "Utility Bills", required: false },
];

export const formatLKR = (amount: number): string => {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const calculateEMI = (principal: number, annualRate: number, tenureMonths: number): number => {
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate === 0) return principal / tenureMonths;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  return Math.round(emi);
};
