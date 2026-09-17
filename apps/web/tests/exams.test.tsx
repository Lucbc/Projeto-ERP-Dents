import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, CanceledError, type InternalAxiosRequestConfig } from "axios";
import { PatientExamsPage } from "../src/pages/patients/patient-exams-page";
import { examService } from "../src/lib/services";
import { api } from "../src/lib/api";
import { changeSession } from "../src/lib/session";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast }) }));
let client: QueryClient;
let failDownload = false;
const blobs: Blob[] = [];
const revoked: string[] = [];
const posted: string[] = [];
beforeEach(() => {
  changeSession(null); toast.mockReset(); failDownload = false; blobs.length = 0; revoked.length = 0; posted.length = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => { blobs.push(blob); return "blob:test-image"; } });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: (url: string) => revoked.push(url) });
  api.defaults.adapter = async (config) => {
    const response = { config, status: 200, statusText: "OK", headers: {}, data: {} as any };
    if (config.url?.endsWith("download")) {
      if (failDownload) throw new AxiosError("Failure", "ERR_BAD_RESPONSE", config, undefined, { ...response, status: 500 });
      // Deliberately hostile legacy bytes/MIME: never opened as an active document.
      return { ...response, data: new Blob(["<script>attack</script>"], { type: "text/html" }) };
    }
    if (config.method === "post") { posted.push(config.url!); return response; }
    if (config.url === "/api/exams/upload-policy") return { ...response, data: { max_bytes: 1024, extensions: [".png", ".jpg", ".jpeg", ".pdf"] } };
    if (config.url === "/api/patients/test/exams") return { ...response, data: [
      { id: "image", original_filename: "test.png", mime_type: "image/png", size_bytes: 20, uploaded_at: "2026-09-16T12:00:00Z" },
      { id: "legacy", original_filename: "old.html", mime_type: "text/html", size_bytes: 20, uploaded_at: "2026-09-16T12:00:00Z" },
      { id: "pdf", original_filename: "test.pdf", mime_type: "application/pdf", size_bytes: 20, uploaded_at: "2026-09-16T12:00:00Z" },
    ] };
    return { ...response, data: { id: "test", full_name: "Fictitious Patient" } };
  };
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/patients/test/exams"]}>
    <Routes><Route path="/patients/:patientId/exams" element={<PatientExamsPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}

it("offers only raster image previews and releases the image URL on close", async () => {
  const open = vi.spyOn(window, "open");
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Visualizar imagem" }));
  expect(await screen.findByRole("img")).toBeTruthy();
  expect(blobs[0].type).toBe("image/png");
  expect(open).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button", { name: "Visualizar imagem" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "x" }));
  await waitFor(() => expect(revoked).toContain("blob:test-image"));
});

it("blocks HTML/PDF previews even when invoked outside the page", async () => {
  await expect(examService.previewImage("legacy", "text/html")).rejects.toThrow();
  await expect(examService.previewImage("pdf", "application/pdf")).rejects.toThrow();
  expect(blobs).toHaveLength(0);
});

it("forces downloads to octet-stream instead of active legacy content", async () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await examService.download("legacy", "old.html");
  expect(blobs[0].type).toBe("application/octet-stream");
  vi.runAllTimers();
  expect(revoked).toContain("blob:test-image");
});

it("reports download errors rather than leaving rejected promises", async () => {
  failDownload = true; mount();
  fireEvent.click((await screen.findAllByRole("button", { name: "Baixar" }))[0]);
  await waitFor(() => expect(toast).toHaveBeenCalledWith("Não foi possível baixar o exame. Tente novamente.", "error"));
});

it("rejects oversized files before posting and shows the server limit", async () => {
  const view = mount();
  await screen.findByText(/Limite por arquivo/);
  const input = view.container.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["x".repeat(1025)], "large.png")] } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() => expect(toast).toHaveBeenCalled());
  expect(posted).toHaveLength(0);
});

it("shows upload progress and cancels the pending request", async () => {
  const adapter = api.defaults.adapter as (config: InternalAxiosRequestConfig) => Promise<any>;
  let captured!: InternalAxiosRequestConfig;
  api.defaults.adapter = (config) => {
    if (config.method !== "post") return adapter(config);
    captured = config;
    config.onUploadProgress?.({ loaded: 5, total: 10 } as any);
    return new Promise((_, reject) => config.signal?.addEventListener?.("abort", () => reject(new CanceledError())));
  };
  const view = mount(); await screen.findByText(/Limite por arquivo/);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["data"], "test.png")] } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await screen.findByText("50% enviado");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar envio" }));
  await waitFor(() => expect(captured.signal?.aborted).toBe(true));
  await waitFor(() => expect(toast).toHaveBeenCalledWith("Envio interrompido. Confira a lista de exames.", "error"));
});
