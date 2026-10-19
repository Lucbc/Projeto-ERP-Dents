// Format/check digits only; no verification of registration or ownership.
function cpfDigits(value: string): string | null {
  if (!/^[0-9.\s-]+$/.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length === 11 ? digits : null;
}

export function sameCpf(value: string, original: string): boolean {
  if (value.trim() === original.trim()) return true;
  const digits = cpfDigits(value);
  return digits !== null && digits === cpfDigits(original);
}

export function validCpf(value: string): boolean {
  if (!value.trim()) return true;
  const digits = cpfDigits(value);
  if (!digits || new Set(digits).size === 1) return false;
  for (const length of [9, 10]) {
    const remainder = [...digits.slice(0, length)].reduce((sum, digit, i) => sum + Number(digit) * (length + 1 - i), 0) % 11;
    if (Number(digits[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}

export function formatCpf(value: string): string {
  if (!/^[0-9.\s-]*$/.test(value)) return value;
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length > 11) return value;
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
