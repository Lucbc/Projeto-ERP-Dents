import type { ClinicalContext } from "@/types/clinical-records";

export function ClinicalContextView({ context, title }: { context: ClinicalContext; title: string }) {
  return <section aria-label={title} className="space-y-3 rounded-md border p-3">
    <h3 className="font-semibold">{title}</h3>
    <div className="rounded-md border border-amber-500 p-3">
      <h4 className="font-semibold">Alergias</h4>
      <p className="whitespace-pre-wrap break-words">{context.allergies?.trim() ? context.allergies : "Não informadas no cadastro."}</p>
    </div>
    <div><h4 className="font-semibold">Histórico médico</h4>
      <p className="whitespace-pre-wrap break-words">{context.medical_history?.trim() ? context.medical_history : "Não informado no cadastro."}</p>
    </div>
  </section>;
}
