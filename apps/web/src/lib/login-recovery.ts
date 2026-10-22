import { sessionTransport, withSessionLock } from './api';
import { changeSession, isCurrentSession, type SessionSnapshot } from './session';
import type { SessionResponse } from '@/types';

export async function recoverLogin(email: string, attempt: SessionSnapshot) {
  return withSessionLock(async () => {
    if (!isCurrentSession(attempt)) return 'changed' as const;
    const { data } = await sessionTransport.get<SessionResponse>('/api/auth/session');
    if (!isCurrentSession(attempt)) return 'changed' as const;
    if (!data.session_id || !data.user) return 'absent' as const;
    if (data.user.email.trim().toLowerCase() !== email.trim().toLowerCase()) return 'different' as const;
    changeSession(data.session_id, data.csrf_token, data.expires_at);
    return 'recovered' as const;
  });
}
