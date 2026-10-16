/** Format local Brazilian numbers while retaining international/legacy input. */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/[^0-9\s().-]/.test(value) || digits.length > 11) return value;
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const area = digits.slice(0, 2);
  const split = digits.length === 11 ? 7 : 6;
  if (digits.length <= split) return `(${area}) ${digits.slice(2)}`;
  return `(${area}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}
