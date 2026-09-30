import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useLiveQuery } from "../src/hooks/use-live-query";
import { LiveQueryStatus } from "../src/components/ui/live-query-status";

let client: QueryClient;
const error = (status: number) => new AxiosError("Fictitious failure", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 1) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient();
});
afterEach(() => { cleanup(); client.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

function View({ read, filter = "one" }: { read: (signal: AbortSignal) => Promise<string>; filter?: string }) {
  const query = useLiveQuery(["appointments", filter], read);
  if (query.accessDenied) return <p>Access ended</p>;
  return <><LiveQueryStatus query={query} /><p data-testid="data">{query.data ?? "Not loaded"}</p></>;
}
function show(read: (signal: AbortSignal) => Promise<string>, filter = "one") {
  return render(<QueryClientProvider client={client}><View read={read} filter={filter} /></QueryClientProvider>);
}

it("refreshes at 15 seconds and manual refresh fetches without writes", async () => {
  const read = vi.fn().mockResolvedValueOnce("Original").mockResolvedValue("Remote"); show(read); await tick();
  expect(screen.getByTestId("data").textContent).toBe("Original");
  await tick(15_001); expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("data").textContent).toBe("Remote");
  fireEvent.click(screen.getByRole("button", {name: "Atualizar agenda"})); await tick();
  expect(read).toHaveBeenCalledTimes(3);
});

it("pauses hidden/offline reads and refreshes on visibility and reconnection", async () => {
  const read = vi.fn().mockResolvedValue("Data"); show(read); await tick();
  act(() => focusManager.setFocused(false)); await tick(45_000); expect(read).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(true)); await tick(); expect(read).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(false)); await tick(45_000); expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/Sem conexão/)).toBeTruthy();
  act(() => onlineManager.setOnline(true)); await tick(); expect(read).toHaveBeenCalledTimes(3);
  act(() => window.dispatchEvent(new Event("focus"))); await tick(); expect(read).toHaveBeenCalledTimes(4);
});

it("does not overlap a slow request on focus, manual refresh or interval", async () => {
  let resolve!: (value: string) => void;
  const read = vi.fn(() => new Promise<string>(done => { resolve = done; })); show(read); await tick();
  act(() => window.dispatchEvent(new Event("focus"))); await tick(45_000);
  expect((screen.getByRole("button", {name: "Atualizar agenda"}) as HTMLButtonElement).disabled).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => resolve("Complete")); await tick(); expect(screen.getByTestId("data").textContent).toBe("Complete");
});

it("retains old data on failure, backs off and recovers explicitly", async () => {
  const read = vi.fn().mockResolvedValueOnce("Old").mockRejectedValueOnce(error(503)).mockResolvedValue("Current");
  show(read); await tick(); await tick(15_001);
  expect(screen.getByTestId("data").textContent).toBe("Old"); expect(screen.getByRole("alert").textContent).toContain("desatualizados");
  await tick(30_000); expect(read).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", {name: "Atualizar agenda"})); await tick();
  expect(screen.getByTestId("data").textContent).toBe("Current");
});

it("initial failure is not an empty successful list and retries after 60 seconds", async () => {
  const read = vi.fn().mockRejectedValueOnce(error(503)).mockResolvedValue("Loaded"); show(read); await tick();
  expect(screen.getByText("Ainda não foi possível verificar as consultas.")).toBeTruthy();
  expect(screen.getByTestId("data").textContent).toBe("Not loaded");
  await tick(60_001); expect(screen.getByTestId("data").textContent).toBe("Loaded");
});

it.each([401, 403])("hides cached data and stops reads after access error %s", async status => {
  const read = vi.fn().mockResolvedValueOnce("Restricted").mockRejectedValue(error(status)); show(read); await tick(); await tick(15_001);
  expect(screen.getByText("Access ended")).toBeTruthy(); expect(screen.queryByText("Restricted")).toBeNull();
  expect(client.getQueryData(["appointments", "one"])).toBeUndefined();
  await tick(120_000); expect(read).toHaveBeenCalledTimes(2);
});

it("aborts old reads when changing filters or leaving the session provider", async () => {
  const signals: AbortSignal[] = [];
  const read = vi.fn((signal: AbortSignal) => { signals.push(signal); return new Promise<string>(() => {}); });
  const view = show(read); await tick();
  view.rerender(<QueryClientProvider client={client}><View read={read} filter="two" /></QueryClientProvider>); await tick();
  expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
  view.unmount(); expect(signals[1].aborted).toBe(true);
});
