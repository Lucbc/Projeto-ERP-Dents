import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PatientDuplicateCheck } from '@/pages/patients/patient-duplicate-check';
import { patientService } from '@/lib/services';

vi.mock('@/lib/services', () => ({ patientService: { duplicateCheck: vi.fn() } }));
const check = vi.mocked(patientService.duplicateCheck);
const onDenied = vi.fn();
const props = { fullName: 'Fictitious Person', birthDate: '1990-01-15', cpf: '', onDenied };
const candidate = { id: 'fictional', full_name: 'Existing Fictitious', birth_date: '1990-01-15', active: false, same_cpf: true };
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('duplicate warning', () => {
  it('does not query incomplete criteria', async () => {
    render(<PatientDuplicateCheck {...props} birthDate="" />);
    expect(screen.getByText(/Informe CPF completo/)).toBeTruthy();
    expect(check).not.toHaveBeenCalled();
  });
  it('shows candidates and allows continuing without a submit action', async () => {
    check.mockResolvedValue({ items: [candidate], total: 12, checked: true });
    render(<PatientDuplicateCheck {...props} />);
    expect(await screen.findByText(/Encontramos 12/)).toBeTruthy();
    expect(screen.getByText(/Existing Fictitious/)).toBeTruthy();
    expect(screen.getByText(/Exibindo 1 de 12/)).toBeTruthy();
    expect(screen.getByText(/você pode continuar/)).toBeTruthy();
  });
  it('does not treat failure as absence and supports retry', async () => {
    check.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ items: [], total: 0, checked: true });
    render(<PatientDuplicateCheck {...props} />);
    expect(await screen.findByText(/Não foi possível conferir/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar conferir novamente' }));
    expect(await screen.findByText(/Isso não garante/)).toBeTruthy();
  });
  it('discards late results after identity fields change', async () => {
    let resolveOld!: (value: { items: typeof candidate[]; total: number; checked: boolean }) => void;
    check.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const { rerender } = render(<PatientDuplicateCheck {...props} />);
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    rerender(<PatientDuplicateCheck {...props} fullName="Another Fictitious" birthDate="" />);
    resolveOld({ items: [candidate], total: 1, checked: true });
    await waitFor(() => expect(screen.queryByText(/Existing Fictitious/)).toBeNull());
    expect(check.mock.calls[0][1]?.aborted).toBe(true);
  });
  it('ends access on permission denial', async () => {
    check.mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    render(<PatientDuplicateCheck {...props} />);
    await waitFor(() => expect(onDenied).toHaveBeenCalledOnce());
  });
});
