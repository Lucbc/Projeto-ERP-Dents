import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { getApiErrorMessage } from "../src/lib/api";
import { ToastProvider, useToast } from "../src/components/ui/toast";
import { CalendarPage } from "../src/pages/appointments/calendar-page";
import { appointmentService, dentistService, patientService, procedureService } from "../src/lib/services";

vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

function failure(status: number, data: unknown) {
  return new AxiosError("private technical detail", "ERR_BAD_RESPONSE", undefined, undefined,
    { status, statusText: "Error", data, headers: {}, config: {} as never });
}

it("describes validation fields without echoing rejected values or backend internals", () => {
  const message = getApiErrorMessage(failure(422, { detail: [
    { loc: ["body", "email"], type: "missing", input: "private", msg: "private" },
    { loc: ["body", "password"], type: "string_type", input: "private" },
  ] }));
  expect(message).toContain("E-mail: campo obrigatório");
  expect(message).toContain("Senha: valor inválido");
  expect(message).not.toContain("private");
  const internal = getApiErrorMessage(failure(500, { detail: "SQL private", request_id: "a".repeat(32) }));
  expect(internal).not.toContain("SQL");
  expect(internal).toContain("Referência: " + "a".repeat(32));
});

it("does not expose proxy HTML and preserves business conflict messages", () => {
  expect(getApiErrorMessage(failure(503, "<html>private proxy detail</html>"))).toContain("temporariamente indisponível");
  expect(getApiErrorMessage(failure(409, { detail: "Registro em uso." }))).toBe("Registro em uso.");
  expect(getApiErrorMessage(failure(500, { request_id: "private" }))).not.toContain("private");
});

it("an older toast timer cannot remove a newer notification", () => {
  vi.useFakeTimers();
  function Buttons() {
    const { toast } = useToast();
    return <><button onClick={() => toast("Primeiro")}>Primeiro</button>
      <button onClick={() => toast("Segundo", "error")}>Segundo</button></>;
  }
  render(<ToastProvider><Buttons /></ToastProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Primeiro" }));
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.click(screen.getByRole("button", { name: "Segundo" }));
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole("alert").textContent).toBe("Segundo");
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("calendar distinguishes loading/failure from an empty schedule and recovers", async () => {
  let reject!: (error: unknown) => void;
  vi.spyOn(appointmentService, "list").mockImplementationOnce(() => new Promise((_, no) => { reject = no; })).mockResolvedValue([]);
  vi.spyOn(patientService, "listAll").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(dentistService, "listAll").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(procedureService, "listAll").mockRejectedValueOnce(failure(503, {})).mockResolvedValue({ items: [], total: 0 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ToastProvider><CalendarPage /></ToastProvider></QueryClientProvider>);
  expect(screen.getByRole("status").textContent).toContain("Carregando agenda");
  await act(async () => reject(failure(503, {})));
  expect((await screen.findByRole("alert")).textContent).toContain("não puderam ser verificadas");
  expect((screen.getByRole("button", { name: "Nova consulta" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect((screen.getByRole("button", { name: "Nova consulta" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Nova consulta" }));
  expect(screen.getByText("Procedimentos indisponíveis. Recarregue os cadastros.")).toBeTruthy();
  expect(screen.queryByText("Nenhum procedimento cadastrado.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Recarregar cadastros" }));
  expect(await screen.findByText("Nenhum procedimento cadastrado.")).toBeTruthy();
});
