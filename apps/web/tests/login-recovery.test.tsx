import { beforeEach, expect, it, vi } from 'vitest';
import { recoverLogin } from '../src/lib/login-recovery';
import { sessionTransport } from '../src/lib/api';
import { changeSession, getSession, SESSION_STORAGE_KEY } from '../src/lib/session';

beforeEach(() => {
  changeSession(null);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: vi.fn(async (_name, work) => work()),
  } });
});
function respond(email: string | null) {
  sessionTransport.defaults.adapter = async config => ({ config, status: 200, statusText: 'OK', headers: {},
    data: { session_id: email ? 'fictitious-session' : null, csrf_token: 'fictitious-csrf', expires_at: Date.now() + 60000,
      user: email ? { email } : null } });
}
it('adopts only the requested identity through the shared lock without posting credentials', async () => {
  respond('test@example.com');
  const adapter = vi.fn(sessionTransport.defaults.adapter as any);
  sessionTransport.defaults.adapter = adapter;
  expect(await recoverLogin(' TEST@example.com ', getSession())).toBe('recovered');
  expect(getSession().sessionId).toBe('fictitious-session');
  expect(navigator.locks.request).toHaveBeenCalledWith('erp-dents-session', expect.any(Function));
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(adapter.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/api/auth/session' });
  expect(adapter.mock.calls[0][0].data).toBeUndefined();
});
it('keeps anonymous state when no session exists', async () => {
  respond(null);
  expect(await recoverLogin('test@example.com', getSession())).toBe('absent');
  expect(getSession().sessionId).toBeNull();
});
it('does not adopt an old cookie belonging to a different account', async () => {
  respond('other@example.com');
  expect(await recoverLogin('test@example.com', getSession())).toBe('different');
  expect(getSession().sessionId).toBeNull();
});
it('preserves state on failed session lookup', async () => {
  sessionTransport.defaults.adapter = async () => { throw new Error('fictional network failure'); };
  await expect(recoverLogin('test@example.com', getSession())).rejects.toThrow('fictional network failure');
  expect(getSession().sessionId).toBeNull();
});
it('discards a late response after another tab changes the session', async () => {
  respond('test@example.com');
  const adapter = sessionTransport.defaults.adapter as any;
  sessionTransport.defaults.adapter = async config => {
    const result = await adapter(config);
    localStorage.setItem(SESSION_STORAGE_KEY, 'other-tab-session');
    return result;
  };
  expect(await recoverLogin('test@example.com', getSession())).toBe('changed');
  expect(getSession().sessionId).toBe('other-tab-session');
});
it('does not query after the attempt context has already changed', async () => {
  const attempt = getSession();
  changeSession('new-context');
  const adapter = vi.fn(); sessionTransport.defaults.adapter = adapter;
  expect(await recoverLogin('test@example.com', attempt)).toBe('changed');
  expect(adapter).not.toHaveBeenCalled();
});
