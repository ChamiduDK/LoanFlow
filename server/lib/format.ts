export function formatLkr(amount: number): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
export function maskPii(value: string | null | undefined, type: "nic" | "account" | "phone" | "email"): string {
  if (!value) return "N/A";

  switch (type) {
    case "email": {
      const [local, domain] = value.split("@");
      if (!domain) return "****";
      return `${local.slice(0, 2)}***@${domain}`;
    }
    case "phone": {
      return `${value.slice(0, 3)}****${value.slice(-3)}`;
    }
    case "nic": {
      return `${value.slice(0, 2)}****${value.slice(-2)}`;
    }
    case "account": {
      return `****${value.slice(-4)}`;
    }
    default:
      return "****";
  }
}
