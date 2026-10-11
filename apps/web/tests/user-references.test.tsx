import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, onlineManager, focusManager } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { UsersPage } from '../src/pages/users/users-page';
import { ToastProvider } from '../src/components/ui/toast';
import { ReadSuspensionContext } from '../src/hooks/read-suspension';
import { dentistService, userService } from '../src/lib/services';
import { api } from '../src/lib/api';
import type { Dentist, User } from '../src/types';
let allowed: boolean, client: QueryClient;
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ can: (resource: string) => resource !== 'dentists' || allowed }) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'fictitious-admin', role: 'admin' }, logout: vi.fn() }) }));
const original = { id: 'fictitious-dentist', full_name: 'Fictitious original', active: true } as Dentist;
const remote = { ...original, full_name: 'Fictitious remote' };
const target = { id: 'fictitious-user', name: 'Fictitious user', email: 'fictitious@example.com', role: 'dentist', dentist_id: original.id, is_active: true, version: 7 } as User;
const failure = (status: number) => new AxiosError('Fictitious', 'ERR_BAD_RESPONSE', undefined, undefined,
  { status, statusText: 'Error', data: {}, headers: {}, config: {} as never });
const tick = async (ms = 10) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement;
const options = () => document.querySelector('select[name="dentist_id"]') as HTMLSelectElement;
const field = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
beforeEach(() => {
  vi.useFakeTimers(); onlineManager.setOnline(true); focusManager.setFocused(true); allowed = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false } } });
  vi.spyOn(userService, 'list').mockResolvedValue({ items: [target], total: 1 });
  vi.spyOn(dentistService, 'listAll').mockResolvedValue({ items: [original], total: 1 });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); onlineManager.setOnline(true); focusManager.setFocused(undefined); vi.useRealTimers(); });
function tree(suspended = false) { return <QueryClientProvider client={client}><ReadSuspensionContext.Provider value={suspended}><ToastProvider><UsersPage /></ToastProvider></ReadSuspensionContext.Provider></QueryClientProvider>; }
async function open(name = 'Novo') { fireEvent.click(button(name)); await tick(); }

it('reads only on new actions, even with recent cache, and freezes options through polling, reconnect and invalidation', async () => {
  render(tree()); await tick(); expect(dentistService.listAll).not.toHaveBeenCalled();
  await open(); const secret = crypto.randomUUID(); fireEvent.change(field('password'), { target: { value: secret } });
  fireEvent.change(field('name'), { target: { value: 'Fictitious draft' } });
  vi.mocked(dentistService.listAll).mockResolvedValue({ items: [remote], total: 1 });
  act(() => onlineManager.setOnline(false)); await tick(30_010); act(() => onlineManager.setOnline(true)); await tick();
  await act(async () => { await client.invalidateQueries({ queryKey: ['dentists'] }); }); await tick();
  expect(dentistService.listAll).toHaveBeenCalledTimes(1); expect(options().textContent).toContain(original.full_name);
  expect(field('name').value).toBe('Fictitious draft'); expect(field('password').value === secret).toBe(true);
  fireEvent.click(button('Atualizar dentistas do formulário')); await tick();
  expect(options().textContent).toContain(remote.full_name); expect(field('password').value === secret).toBe(true);
  fireEvent.click(button('Cancelar')); await open(); expect(dentistService.listAll).toHaveBeenCalledTimes(3);
  expect(options().textContent).toContain(remote.full_name); expect(field('password').value).toBe('');
  expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data)).includes(secret)).toBe(false);
});

it('disables initial preparation, cancels close/unmount and ignores late results in another action', async () => {
  let finish!: (value: { items: Dentist[]; total: number }) => void; let signal: AbortSignal | undefined;
  vi.mocked(dentistService.listAll).mockImplementationOnce((_params, s) => { signal = s; return new Promise(done => { finish = done; }); });
  const view = render(tree()); await tick(); fireEvent.click(button('Novo')); fireEvent.click(button('Novo')); await tick();
  expect(dentistService.listAll).toHaveBeenCalledTimes(1); expect(field('name').matches(':disabled')).toBe(true); expect(button('Salvar').disabled).toBe(true);
  fireEvent.click(button('Cancelar')); expect(signal?.aborted).toBe(true); await open();
  await act(async () => finish({ items: [remote], total: 1 })); await tick(); expect(options().textContent).toContain(original.full_name);
  vi.mocked(dentistService.listAll).mockImplementation((_params, s) => { signal = s; return new Promise(() => {}); });
  fireEvent.click(button('Atualizar dentistas do formulário')); await tick(); view.unmount(); expect(signal?.aborted).toBe(true);
});

it.each([503, 403])('reference failure %s never appears as empty success and recovery preserves the draft', async status => {
  render(tree()); await tick(); await open(); fireEvent.change(field('name'), { target: { value: 'Fictitious draft' } });
  vi.mocked(dentistService.listAll).mockRejectedValue(failure(status)); fireEvent.click(button('Atualizar dentistas do formulário')); await tick();
  expect(button('Salvar').disabled).toBe(true); expect(options().textContent).not.toContain(original.full_name);
  expect(screen.getByText(status === 403 ? /Sem acesso aos dentistas/ : /Não foi possível carregar os dentistas/)).toBeTruthy();
  vi.mocked(dentistService.listAll).mockResolvedValue({ items: [remote], total: 1 }); fireEvent.click(button('Atualizar dentistas do formulário')); await tick();
  expect(field('name').value).toBe('Fictitious draft'); expect(options().textContent).toContain(remote.full_name);
});

it('preserves the selected missing ID instead of choosing another dentist and keeps the captured user version', async () => {
  const update = vi.spyOn(userService, 'update').mockResolvedValue(target);
  vi.mocked(dentistService.listAll).mockResolvedValue({ items: [{ ...remote, id: 'other', active: false }], total: 1 });
  render(tree()); await tick(); await open('Editar'); expect(options().value).toBe(original.id);
  expect(options().textContent).toContain('indisponível'); expect(options().textContent).toContain('(inativo)'); expect(button('Salvar').disabled).toBe(true);
  vi.mocked(userService.list).mockResolvedValue({ items: [{ ...target, version: 9 }], total: 1 }); await tick(15_010);
  vi.mocked(dentistService.listAll).mockResolvedValue({ items: [remote], total: 1 }); fireEvent.click(button('Atualizar dentistas do formulário')); await tick();
  expect(options().value).toBe(original.id); fireEvent.click(button('Salvar')); await tick();
  expect(update).toHaveBeenCalledWith(target.id, expect.objectContaining({ version: 7, dentist_id: original.id }));
});

it('clears denied reference names, reloads on grant and preserves ready snapshots through global suspension', async () => {
  const view = render(tree()); await tick(); await open('Editar'); fireEvent.change(field('name'), { target: { value: 'Fictitious draft' } });
  view.rerender(tree(true)); await tick(); expect(button('Salvar').disabled).toBe(true);
  view.rerender(tree()); await tick(); expect(dentistService.listAll).toHaveBeenCalledTimes(1);
  allowed = false; view.rerender(tree()); await tick(); expect(options().textContent).not.toContain(original.full_name); expect(button('Salvar').disabled).toBe(true);
  allowed = true; vi.mocked(dentistService.listAll).mockResolvedValue({ items: [remote], total: 1 }); view.rerender(tree()); await tick();
  expect(dentistService.listAll).toHaveBeenCalledTimes(2); expect(options().textContent).toContain(remote.full_name); expect(field('name').value).toBe('Fictitious draft');
});

it('passes cancellation through every pagination request and rejects partial results after abort', async () => {
  vi.mocked(dentistService.listAll).mockRestore(); const controller = new AbortController();
  const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { items: Array(200).fill(original), total: 201 } }).mockResolvedValueOnce({ data: { items: [remote], total: 201 } });
  const result = await dentistService.listAll({}, controller.signal); expect(result.items).toHaveLength(201);
  expect(get.mock.calls.map(call => call[1])).toEqual([0, 200].map(offset => ({ params: { limit: 200, offset }, signal: controller.signal })));
  get.mockClear().mockImplementationOnce(async () => { controller.abort(); return { data: { items: Array(200).fill(original), total: 201 } }; });
  await expect(dentistService.listAll({}, controller.signal)).rejects.toThrow(); expect(get).toHaveBeenCalledTimes(1);
  await expect(dentistService.listAll({}, controller.signal)).rejects.toThrow(); expect(get).toHaveBeenCalledTimes(1);
});
