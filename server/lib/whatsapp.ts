export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const stripped = trimmed
    .replace(/^whatsapp:/i, "")
    .replace(/@c\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .trim();
  const digits = stripped.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (hasPlus || /^\d{10,15}@/i.test(trimmed)) {
    return `+${digits}`;
  }

  if (stripped.startsWith("0")) {
    return digits;
  }

  return `+${digits}`;
}

export function normalizeWhatsAppAddress(value: string): string {
  const normalizedPhone = normalizePhoneNumber(value);
  return normalizedPhone ? `whatsapp:${normalizedPhone}` : "whatsapp:";
}

export function toWhatsAppChatId(value: string): string {
  const digits = normalizePhoneNumber(value).replace(/\D/g, "");
  return `${digits}@c.us`;
}

export function phoneFromWhatsAppChatId(value: string): string {
  return normalizePhoneNumber(value);
}
