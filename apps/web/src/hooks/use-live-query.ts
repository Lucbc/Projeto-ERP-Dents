import { focusManager, onlineManager, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const subscribeOnline = (notify: () => void) => onlineManager.subscribe(notify);
const subscribeFocus = (notify: () => void) => focusManager.subscribe(notify);
const isOnline = () => onlineManager.isOnline();
const isVisible = () => focusManager.isFocused();

/** Opt-in reads only: never refresh form references or replace captured versions. */
export function useLiveQuery<T>(queryKey: QueryKey, read: (signal: AbortSignal) => Promise<T>,
  { enabled = true, exactOnDenied = false, gcTime, stopOnNotFound = false }:
    { enabled?: boolean; exactOnDenied?: boolean; gcTime?: number; stopOnNotFound?: boolean } = {}) {
  const client = useQueryClient();
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const visible = useSyncExternalStore(subscribeFocus, isVisible);
  const [accessLost, setAccessLost] = useState(false);
  const [missing, setMissing] = useState(false);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => read(signal),
    enabled: enabled && online && visible && !accessLost && !missing,
    gcTime,
    // A manually restored missing record is fresh when its interval is re-enabled.
    staleTime: stopOnNotFound ? 15_000 : 0,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: (current) => {
      if (!enabled || !online || !visible || accessLost || missing) return false;
      const error = current.state.error;
      if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) return false;
      if (stopOnNotFound && isAxiosError(error) && error.response?.status === 404) return false;
      return error ? 60_000 : 15_000;
    },
    refetchIntervalInBackground: false,
  });
  const denied = accessLost || (isAxiosError(query.error) && [401, 403].includes(query.error.response?.status ?? 0));
  const absent = stopOnNotFound && isAxiosError(query.error) && query.error.response?.status === 404;
  useEffect(() => {
    if (absent && !missing) {
      setMissing(true);
      client.removeQueries({ queryKey, exact: true });
    } else if (missing && query.isSuccess) setMissing(false);
  }, [absent, missing, query.isSuccess, client, queryKey]);
  useEffect(() => {
    if (!denied || accessLost) return;
    setAccessLost(true);
    client.removeQueries({ queryKey: exactOnDenied ? queryKey : [queryKey[0]], exact: exactOnDenied });
  }, [denied, accessLost, client, queryKey, exactOnDenied]);
  const refresh = useCallback(() => {
    if (enabled && online && visible && !denied) void query.refetch({ cancelRefetch: false });
  }, [enabled, online, visible, denied, query.refetch]);
  useEffect(() => {
    const onFocus = () => { if (!missing && !absent) refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, missing, absent]);
  return { ...query, data: denied || !enabled || missing || absent ? undefined : query.data,
    online, accessDenied: denied, notFound: missing || absent, refresh };
}
