import { focusManager, onlineManager, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const subscribeOnline = (notify: () => void) => onlineManager.subscribe(notify);
const subscribeFocus = (notify: () => void) => focusManager.subscribe(notify);
const isOnline = () => onlineManager.isOnline();
const isVisible = () => focusManager.isFocused();

/** Opt-in reads only: never refresh form references or replace captured versions. */
export function useLiveQuery<T>(queryKey: QueryKey, read: (signal: AbortSignal) => Promise<T>) {
  const client = useQueryClient();
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const visible = useSyncExternalStore(subscribeFocus, isVisible);
  const [accessLost, setAccessLost] = useState(false);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => read(signal),
    enabled: online && visible && !accessLost,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: (current) => {
      if (!online || !visible || accessLost) return false;
      const error = current.state.error;
      if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) return false;
      return error ? 60_000 : 15_000;
    },
    refetchIntervalInBackground: false,
  });
  const denied = accessLost || (isAxiosError(query.error) && [401, 403].includes(query.error.response?.status ?? 0));
  useEffect(() => {
    if (!denied || accessLost) return;
    setAccessLost(true);
    client.removeQueries({ queryKey: [queryKey[0]] });
  }, [denied, accessLost, client, queryKey]);
  const refresh = useCallback(() => {
    if (online && visible && !denied) void query.refetch({ cancelRefetch: false });
  }, [online, visible, denied, query.refetch]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return { ...query, data: denied ? undefined : query.data, online, accessDenied: denied, refresh };
}
