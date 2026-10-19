import { expect, it } from 'vitest';
import { formatCpf, sameCpf, validCpf } from '../src/lib/cpf';

it('checks format and both digits, allowing absence', () => {
  for (const value of ['', ' ', '12345678909', '123.456.789-09', '98765432100']) expect(validCpf(value)).toBe(true);
  for (const value of ['123', '123456789012', 'DOC-12345678909', '12345678901', '12345678919', '12345678900', '00000000000', '11111111111', '１２３４５６７８９０９']) expect(validCpf(value)).toBe(false);
});

it('preserves mixed and long input instead of silently discarding characters', () => {
  for (const value of ['DOC-123', '123456789012', '123.456.789-090']) expect(formatCpf(value)).toBe(value);
  expect(formatCpf('12345678909')).toBe('123.456.789-09');
  expect(sameCpf(' OLD-123 ', 'OLD-123')).toBe(true);
  expect(sameCpf('OLD-456', 'OLD-123')).toBe(false);
  expect(sameCpf('123.456.789-01', '12345678901')).toBe(true);
});
