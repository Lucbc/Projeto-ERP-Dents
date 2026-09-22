import { getSession, subscribeSession } from "./session";

const storageKey = "erp_financial_uncertain";
let scope = getSession().sessionId;
subscribeSession(() => {
  const next = getSession().sessionId;
  if (scope !== next) sessionStorage.removeItem(storageKey);
  scope = next;
});
// Only entry identifiers and a session marker persist; no forms, reasons or credentials.
export function uncertainFinancialEntry(id: string, value?: boolean): boolean {
  let state: { scope: string | null; ids: string[] };
  try { state = JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { state = null!; }
  if (!state || state.scope !== getSession().sessionId || !Array.isArray(state.ids)) state = { scope: getSession().sessionId, ids: [] };
  if (value !== undefined) {
    state.ids = state.ids.filter((item) => item !== id);
    if (value) state.ids.push(id);
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  }
  return state.ids.includes(id);
}
