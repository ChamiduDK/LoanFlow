export function normalizeTelegramChatId(value: string | number): string {
  return String(value).trim();
}
