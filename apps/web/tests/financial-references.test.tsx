import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReferenceSnapshot } from "../src/pages/financial/reference-snapshot";
import type { FinancialReferenceSnapshot } from "../src/types";

afterEach(cleanup);
const snapshot: FinancialReferenceSnapshot = {
  schema_version: 1, origin: "migration", captured_at: "2030-01-07T13:00:00Z", description: "Cobrança fictícia",
  patient: {id: "fictitious", name: "Paciente histórico fictício"}, dentist: {id: "removed", name: null},
  appointment: {id: null, start_at: null}, procedures: [{id: "removed", name: null}],
};
it("identifies migration provenance and missing records without inventing names", () => {
  render(<ReferenceSnapshot snapshot={snapshot} title="Origem do lançamento" />);
  expect(screen.getByText(/pode diferir da original/)).toBeTruthy();
  expect(screen.getByText(/Paciente histórico fictício/)).toBeTruthy();
  expect(screen.getByText("Dentista: Cadastro indisponível")).toBeTruthy();
  expect(screen.getByText("Procedimento: Cadastro indisponível")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("distinguishes a recorded snapshot from missing historical data", () => {
  const view = render(<ReferenceSnapshot snapshot={{...snapshot, origin:"recorded"}} title="Referências deste pagamento" />);
  expect(screen.getByText("Referência preservada no momento do registro.")).toBeTruthy();
  expect(screen.queryByText(/pode diferir da original/)).toBeNull();
  view.rerender(<ReferenceSnapshot title="Origem do lançamento" />);
  expect(screen.getByText("Referências históricas indisponíveis.")).toBeTruthy();
});
