import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

export const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !axios.isCancel(error)
        && !(axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0))
        && count < 2,
    },
  },
});
