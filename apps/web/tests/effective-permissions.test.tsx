import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { EffectivePermissionsProvider, useEffectivePermissions } from "../src/hooks/use-effective-permissions";
import { permissionService } from "../src/lib/services";
import type { RolePermission, User, UserRole } from "../src/types";

let user: User | null;
let client: QueryClient;
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user }) }));
const matrix = (view = true, role: UserRole = "reception", version = 1): RolePermission => ({
  role, version, permissions: { patients: { view, create: false, update: false, delete: false } },
});
const failure = (status: number) => new AxiosError("Fictitious failure", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function Consumer({ id }: { id: number }) {
  const access = useEffectivePermissions();
  return <div data-testid={`consumer-${id}`}>
    <span>{access.status}:{String(access.can("patients", "view"))}:{access.version ?? "none"}:{Object.keys(access.permissions).length}</span>
    <button onClick={access.refresh}>Refresh {id}</button>
    <input aria-label={`Draft ${id}`} defaultValue="Fictitious draft" />
  </div>;
}
const tree = (count = 3) => <QueryClientProvider client={client}><EffectivePermissionsProvider>
  {Array.from({ length: count }, (_, id) => <Consumer key={id} id={id} />)}
</EffectivePermissionsProvider></QueryClientProvider>;
const state = () => screen.getByTestId("consumer-0").textContent;
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient(); user = { id: "fictitious-user", role: "reception" } as User;
  vi.spyOn(permissionService, "me").mockResolvedValue(matrix());
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

it("shares one reader across consumers and mounting another does not fetch", async () => {
  const view = render(tree()); await tick(); expect(permissionService.me).toHaveBeenCalledTimes(1);
  await tick(7000); view.rerender(tree(5)); await tick(); expect(permissionService.me).toHaveBeenCalledTimes(1);
  await tick(8000); expect(permissionService.me).toHaveBeenCalledTimes(2);
  expect(client.getQueryCache().findAll({ queryKey: ["permissions", "me"] })).toHaveLength(1);
  for (let id = 0; id < 5; id++) expect(screen.getByTestId(`consumer-${id}`).textContent).toContain("verified:true:1:1");
});

it.each<UserRole>(["admin", "coordinator", "dentist", "reception"])("verifies %s before granting authority", async role => {
  user = { ...user!, role }; vi.mocked(permissionService.me).mockResolvedValue(matrix(true, role));
  render(tree()); expect(state()).toContain("checking:false:none:0"); await tick();
  expect(state()).toContain("verified:true:1:1"); expect(permissionService.me).toHaveBeenCalledTimes(1);
});

it("does not fetch or grant authority anonymously", async () => {
  user = null; render(tree()); await tick(60_000);
  expect(state()).toContain("anonymous:false:none:0"); expect(permissionService.me).not.toHaveBeenCalled();
});

it("observes revocation and later grant without remounting consumers or writing", async () => {
  const write = vi.spyOn(permissionService, "update"); render(tree()); await tick();
  fireEvent.change(screen.getByLabelText("Draft 0"), { target: { value: "Preserved draft" } });
  vi.mocked(permissionService.me).mockResolvedValue(matrix(false, "reception", 2)); await tick(15_005);
  expect(state()).toContain("verified:false:2:1");
  vi.mocked(permissionService.me).mockResolvedValue(matrix(true, "reception", 3)); await tick(15_005);
  expect(state()).toContain("verified:true:3:1");
  expect((screen.getByLabelText("Draft 0") as HTMLInputElement).value).toBe("Preserved draft");
  expect(write).not.toHaveBeenCalled();
});

it("hides the old matrix on transient failure, backs off and recovers manually", async () => {
  render(tree()); await tick(); vi.mocked(permissionService.me).mockRejectedValue(failure(503));
  await tick(15_005); expect(state()).toContain("unavailable:false:none:0");
  await tick(30_000); expect(permissionService.me).toHaveBeenCalledTimes(2);
  vi.mocked(permissionService.me).mockResolvedValue(matrix());
  fireEvent.click(screen.getByText("Refresh 2")); await tick(); expect(state()).toContain("verified:true");
});

it("recovers an initial error after 60 seconds without granting cached authority", async () => {
  vi.mocked(permissionService.me).mockRejectedValueOnce(failure(503)).mockResolvedValue(matrix());
  render(tree()); await tick(); expect(state()).toContain("unavailable:false:none:0");
  await tick(59_000); expect(permissionService.me).toHaveBeenCalledTimes(1);
  await tick(1005); expect(state()).toContain("verified:true");
});

it("pauses hidden/offline reads, then resumes on visibility, reconnect and focus", async () => {
  render(tree()); await tick(); act(() => focusManager.setFocused(false));
  await tick(45_000); expect(permissionService.me).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(true)); await tick(); expect(permissionService.me).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(false)); fireEvent.click(screen.getByText("Refresh 1"));
  await tick(45_000); expect(permissionService.me).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(true)); await tick(); expect(permissionService.me).toHaveBeenCalledTimes(3);
  act(() => window.dispatchEvent(new Event("focus"))); await tick(); expect(permissionService.me).toHaveBeenCalledTimes(4);
});

it("does not overlap slow reads across manual, interval and focus triggers", async () => {
  let resolve!: (data: RolePermission) => void;
  vi.mocked(permissionService.me).mockImplementation(() => new Promise(done => { resolve = done; }));
  render(tree()); await tick(); fireEvent.click(screen.getByText("Refresh 0")); fireEvent.click(screen.getByText("Refresh 2"));
  act(() => window.dispatchEvent(new Event("focus"))); await tick(45_000);
  expect(permissionService.me).toHaveBeenCalledTimes(1);
  await act(async () => resolve(matrix())); await tick(); expect(state()).toContain("verified:true");
});

it.each([401, 403])("clears only its matrix and stops after HTTP %s", async code => {
  client.setQueryData(["permissions", "roles"], "unrelated"); render(tree()); await tick();
  vi.mocked(permissionService.me).mockRejectedValue(failure(code)); await tick(15_005);
  expect(state()).toContain("denied:false:none:0");
  expect(client.getQueryData(["permissions", "me", user!.id])).toBeUndefined();
  expect(client.getQueryData(["permissions", "roles"])).toBe("unrelated");
  fireEvent.click(screen.getByText("Refresh 0")); await tick(120_000); expect(permissionService.me).toHaveBeenCalledTimes(2);
});

it("never accepts a matrix for another role, including an apparent admin promotion", async () => {
  vi.mocked(permissionService.me).mockResolvedValue(matrix(true, "admin")); render(tree()); await tick();
  expect(state()).toContain("identity-mismatch:false:none:0");
});

it("aborts an old identity and ignores its late response; unmount aborts the new read", async () => {
  const signals: AbortSignal[] = []; const resolvers: ((data: RolePermission) => void)[] = [];
  vi.mocked(permissionService.me).mockImplementation(signal => {
    signals.push(signal!); return new Promise(done => { resolvers.push(done); });
  });
  const view = render(tree()); await tick(); const oldId = user!.id;
  user = { ...user!, id: "another-fictitious-user" }; view.rerender(tree()); await tick();
  expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
  await act(async () => resolvers[0](matrix())); await tick();
  expect(state()).toContain("checking:false:none:0");
  expect(client.getQueryData(["permissions", "me", oldId])).toBeUndefined();
  view.unmount(); expect(signals[1].aborted).toBe(true);
});

it("requires an explicit provider instead of silently adding another reader", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Consumer id={0} />)).toThrow(/requires EffectivePermissionsProvider/);
  expect(permissionService.me).not.toHaveBeenCalled(); log.mockRestore();
});
