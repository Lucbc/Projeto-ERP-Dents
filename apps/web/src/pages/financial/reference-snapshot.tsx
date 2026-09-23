import type { FinancialReferenceSnapshot } from "@/types";

export function ReferenceSnapshot({ snapshot, title }: { snapshot?: FinancialReferenceSnapshot | null; title: string }) {
  return <section className="rounded border p-3 space-y-1">
    <h4 className="font-semibold">{title}</h4>
    {!snapshot ? <p>Referências históricas indisponíveis.</p> : <>
      <p className="text-sm">{snapshot.origin === "migration"
        ? "Referência disponível na migração; pode diferir da original."
        : "Referência preservada no momento do registro."}</p>
      <p className="text-sm">Captura: {new Date(snapshot.captured_at).toLocaleString("pt-BR")}</p>
      <p>Descrição: {snapshot.description}</p>
      <p>Paciente: {snapshot.patient.name ?? (snapshot.patient.id ? "Cadastro indisponível" : "Sem referência disponível")}</p>
      <p>Dentista: {snapshot.dentist.name ?? (snapshot.dentist.id ? "Cadastro indisponível" : "Sem referência disponível")}</p>
      <p>Consulta: {snapshot.appointment.start_at ? new Date(snapshot.appointment.start_at).toLocaleString("pt-BR") : "Sem data disponível"}</p>
      {snapshot.procedures.length ? <ul>{snapshot.procedures.map((procedure, index) =>
        <li key={`${procedure.id}-${index}`}>Procedimento: {procedure.name ?? "Cadastro indisponível"}</li>)}</ul> : <p>Sem procedimentos registrados.</p>}
    </>}
  </section>;
}
