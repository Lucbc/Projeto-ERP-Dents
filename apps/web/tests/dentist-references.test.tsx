import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, onlineManager, focusManager } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { DentistsPage } from '../src/pages/dentists/dentists-page';
import { ToastProvider } from '../src/components/ui/toast';
import { ReadSuspensionContext } from '../src/hooks/read-suspension';
import { dentistService, specialtyService } from '../src/lib/services';
import { api } from '../src/lib/api';
import type { Dentist, Specialty } from '../src/types';
let allowed: boolean, client: QueryClient;
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ can: (resource: string) => resource !== 'specialties' || allowed }) }));
const original = { id: 'fictitious-specialty', name: 'Fictitious original', active: true, version: 1 } as Specialty;
const remote = { ...original, name: 'Fictitious remote', active: false };
const target = { id: 'fictitious-dentist', full_name: 'Fictitious dentist', specialty: original.name, active: true, color: '#0EA5A5', version: 7,
  availability: [{ day_of_week: 'monday', start_time: '08:00', end_time: '18:00' }] } as Dentist;
const failure = (status: number, code = '') => new AxiosError('Fictitious', 'ERR_BAD_RESPONSE', undefined, undefined,
  { status, statusText: 'Error', data: { code }, headers: {}, config: {} as never });
const tick = async (ms = 10) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement;
const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
beforeEach(() => {
  vi.useFakeTimers(); onlineManager.setOnline(true); focusManager.setFocused(true); allowed = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false } } });
  vi.spyOn(dentistService, 'list').mockResolvedValue({ items: [target], total: 1 });
  vi.spyOn(specialtyService, 'listAll').mockResolvedValue({ items: [original], total: 1 });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); onlineManager.setOnline(true); focusManager.setFocused(undefined); vi.useRealTimers(); });
function tree(suspended = false) { return <QueryClientProvider client={client}><ReadSuspensionContext.Provider value={suspended}><ToastProvider><DentistsPage /></ToastProvider></ReadSuspensionContext.Provider></QueryClientProvider>; }
async function open(name = 'Novo') { fireEvent.click(button(name)); await tick(); }

it('reads per action and preserves specialty, hours and version across remote cache/reconnect and explicit option refresh', async () => {
  const update = vi.spyOn(dentistService, 'update').mockResolvedValue(target);
  render(tree()); await tick(); expect(specialtyService.listAll).not.toHaveBeenCalled(); await open('Editar');
  fireEvent.change(field('availability.0.start_time'), { target: { value: '09:00' } });
  vi.mocked(specialtyService.listAll).mockResolvedValue({ items: [remote], total: 1 });
  vi.mocked(dentistService.list).mockResolvedValue({ items: [{ ...target, version: 9 }], total: 1 });
  act(() => onlineManager.setOnline(false)); await tick(30_010); act(() => onlineManager.setOnline(true)); await tick();
  await act(async () => { await client.invalidateQueries({ queryKey: ['specialties'] }); }); await tick();
  expect(specialtyService.listAll).toHaveBeenCalledTimes(1); expect(field('specialty').textContent).not.toContain(remote.name);
  fireEvent.click(button('Atualizar especialidades do formulário')); await tick();
  expect(field('specialty').value).toBe(original.name); expect(field('specialty').textContent).toContain('(fora do cadastro atual)');
  expect(field('specialty').textContent).toContain('(inativa)'); expect(field('availability.0.start_time').value).toBe('09:00');
  fireEvent.click(button('Salvar')); await tick();
  expect(update).toHaveBeenCalledWith(target.id, expect.objectContaining({ version: 7, specialty: original.name,
    availability: [{ day_of_week: 'monday', start_time: '09:00', end_time: '18:00' }] }));
  await open(); expect(specialtyService.listAll).toHaveBeenCalledTimes(3); expect(field('specialty').textContent).toContain(remote.name);
});

it('cancels a closed preparation and ignores its late response in a new form', async () => {
  let finish!: (value: { items: Specialty[]; total: number }) => void; let signal: AbortSignal | undefined;
  vi.mocked(specialtyService.listAll).mockImplementationOnce((_params, s) => { signal = s; return new Promise(done => { finish = done; }); });
  const view = render(tree()); await tick(); fireEvent.click(button('Novo')); fireEvent.click(button('Novo')); await tick();
  expect(specialtyService.listAll).toHaveBeenCalledTimes(1); expect(field('full_name').matches(':disabled')).toBe(true);
  fireEvent.click(button('Cancelar')); await tick(); expect(signal?.aborted).toBe(true); await open();
  await act(async () => finish({ items: [remote], total: 1 })); await tick(); expect(field('specialty').textContent).not.toContain(remote.name);
  vi.mocked(specialtyService.listAll).mockImplementation((_params, s) => { signal = s; return new Promise(() => {}); });
  fireEvent.click(button('Atualizar especialidades do formulário')); await tick(); view.unmount(); expect(signal?.aborted).toBe(true);
});

it.each([503, 403])('shows reference failure %s without replacing the draft and allows explicit recovery', async status => {
  render(tree()); await tick(); await open('Editar'); fireEvent.change(field('full_name'), { target: { value: 'Fictitious draft' } });
  vi.mocked(specialtyService.listAll).mockRejectedValue(failure(status)); fireEvent.click(button('Atualizar especialidades do formulário')); await tick();
  expect(button('Salvar').disabled).toBe(true); expect(screen.getByText(status === 403 ? /Sem acesso às especialidades/ : /Não foi possível carregar as especialidades/)).toBeTruthy();
  vi.mocked(specialtyService.listAll).mockResolvedValue({ items: [remote], total: 1 }); fireEvent.click(button('Atualizar especialidades do formulário')); await tick();
  expect(field('full_name').value).toBe('Fictitious draft'); expect(field('specialty').value).toBe(original.name);
});

it('separates reference permission and global suspension while preserving authorized dentist fields', async () => {
  const view = render(tree()); await tick(); await open('Editar');
  view.rerender(tree(true)); await tick(); expect(button('Salvar').disabled).toBe(true);
  view.rerender(tree()); await tick(); expect(specialtyService.listAll).toHaveBeenCalledTimes(1);
  allowed = false; view.rerender(tree()); await tick(); expect(button('Salvar').disabled).toBe(true);
  expect(field('full_name').value).toBe(target.full_name); // Dentist data still authorized independently.
  allowed = true; vi.mocked(specialtyService.listAll).mockResolvedValue({ items: [remote], total: 1 }); view.rerender(tree()); await tick();
  expect(specialtyService.listAll).toHaveBeenCalledTimes(2); expect(field('specialty').textContent).toContain(remote.name);
});

it('option refresh never releases the existing availability conflict review or resubmits', async () => {
  const update = vi.spyOn(dentistService, 'update').mockRejectedValue(failure(409, 'availability_conflict'));
  render(tree()); await tick(); await open('Editar'); fireEvent.click(button('Salvar')); await tick();
  expect(button('Atualizar disponibilidade para revisar')).toBeTruthy(); expect(button('Salvar').disabled).toBe(true);
  fireEvent.click(button('Atualizar especialidades do formulário')); await tick(); expect(button('Salvar').disabled).toBe(true); expect(update).toHaveBeenCalledTimes(1);
  fireEvent.click(button('Atualizar disponibilidade para revisar')); await tick(); expect(button('Salvar').disabled).toBe(false); expect(update).toHaveBeenCalledTimes(1);
});

it('forwards pagination cancellation and rejects a failed later page instead of exposing partial success', async () => {
  vi.mocked(specialtyService.listAll).mockRestore(); const controller = new AbortController();
  const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { items: Array(200).fill(original), total: 201 } }).mockRejectedValueOnce(failure(503));
  await expect(specialtyService.listAll({}, controller.signal)).rejects.toThrow();
  expect(get.mock.calls.map(call => call[1])).toEqual([0, 200].map(offset => ({ params: { limit: 200, offset }, signal: controller.signal })));
  get.mockClear().mockImplementationOnce(async () => { controller.abort(); return { data: { items: Array(200).fill(original), total: 201 } }; });
  await expect(specialtyService.listAll({}, controller.signal)).rejects.toThrow(); expect(get).toHaveBeenCalledTimes(1);
});
