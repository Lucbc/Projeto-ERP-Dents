import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { usePermissions } from "@/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { fromInputDateTime } from "@/lib/datetime";
import { paymentMethodOptions } from "@/lib/labels";
import { uncertainFinancialEntry } from "@/lib/financial-attempt";
import { financialService } from "@/lib/services";
import type { FinancialEntry, FinancialOperation, PaymentMethod } from "@/types";

type Attempt = { kind: "settle"; payload: { version: number; idempotency_key: string; paid_at: string | null; payment_method: PaymentMethod | null } }
  | { kind: "reverse"; payload: { version: number; idempotency_key: string; payment_id: string; reason: string } };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);

export function PaymentDialog({ entry, mode, onClose, onChanged }: {
  entry: FinancialEntry; mode: "pay" | "history"; onClose: () => void; onChanged: () => void;
}) {
  const { can } = usePermissions();
  const [current, setCurrent] = useState(entry);
  const [date, setDate] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">(entry.payment_method || "");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(uncertainFinancialEntry(entry.id));
  const [blocked, setBlocked] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const history = useQuery({ queryKey: ["financial", "payments", entry.id], queryFn: () => financialService.payments(entry.id) });
  const mutation = useMutation({
    mutationFn: (operation: Attempt) => operation.kind === "settle"
      ? financialService.markAsPaid(entry.id, operation.payload)
      : financialService.reversePayment(entry.id, operation.payload),
    onSuccess: (result: FinancialOperation) => {
      uncertainFinancialEntry(entry.id, false);
      setUncertain(false); attempt.current = null;
      setCurrent(result.entry); setBlocked(true);
      setMessage(result.replayed ? "Operação anterior recuperada. Confira o estado atual e o histórico." : "Operação registrada. Confira o histórico atualizado.");
      void history.refetch(); onChanged();
    },
    onError: (error) => {
      const unknown = !isAxiosError(error) || !error.response || error.response.status >= 500;
      setUncertain(unknown); uncertainFinancialEntry(entry.id, unknown);
      if (!unknown) { attempt.current = null; setBlocked(true); }
      setMessage(unknown ? "Não foi possível confirmar o resultado. Repita a mesma operação para recuperar a resposta; não faça uma nova baixa." : getApiErrorMessage(error));
    },
  });
  function submit(kind: "settle" | "reverse") {
    if (mutation.isPending || blocked || uncertain) return;
    const operation: Attempt = kind === "settle"
      ? { kind, payload: { version: current.version, idempotency_key: crypto.randomUUID(), paid_at: date ? fromInputDateTime(date) : null, payment_method: method || null } }
      : { kind, payload: { version: current.version, idempotency_key: crypto.randomUUID(), payment_id: current.active_payment_id!, reason: reason.trim() } };
    attempt.current = operation; mutation.mutate(operation);
  }
  return <Modal open title={mode === "pay" ? "Confirmar baixa" : "Pagamentos e estornos"} onClose={() => { if (!mutation.isPending) onClose(); }}>
    <div className="space-y-4">
      <p>{current.entry_type === "income" ? "Recebimento" : "Pagamento de despesa"}: <strong>{money(current.total_cents)}</strong></p>
      <p>Estado atual: {current.status === "paid" ? "Pago" : current.status === "pending" ? "Pendente" : "Cancelado"}.</p>
      {message && <p role="alert">{message}</p>}
      {uncertain && <div role="alert" className="rounded border border-amber-300 p-3">
        <p>Há uma operação com resultado incerto. Confira o histórico antes de iniciar outra.</p>
        {attempt.current ? <Button disabled={mutation.isPending} onClick={() => mutation.mutate(attempt.current!)}>Consultar/repetir esta operação</Button>
          : <Button disabled={!history.isSuccess || history.isFetching} onClick={() => { uncertainFinancialEntry(entry.id, false); setUncertain(false); setBlocked(true); setMessage("Feche esta janela e recarregue a lista antes de escolher uma nova ação."); onChanged(); }}>Conferi o histórico</Button>}
      </div>}
      {mode === "pay" && current.status === "pending" && <fieldset disabled={mutation.isPending || uncertain || blocked} className="space-y-2">
        <label className="block">Data do pagamento (vazia: horário atual)<Input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="block">Forma de pagamento<Select value={method} onChange={e => setMethod(e.target.value as PaymentMethod | "")}><option value="">Não informada</option>{paymentMethodOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></label>
        <Button onClick={() => submit("settle")}>Confirmar baixa integral</Button>
      </fieldset>}
      {current.status === "paid" && !blocked && can("financial", "update") && can("financial_reversals", "create") && <fieldset disabled={mutation.isPending || uncertain} className="space-y-2">
        <p>Estornar desfaz o registro no ERP e reabre o lançamento. Não devolve dinheiro por banco ou cartão.</p>
        <label className="block">Motivo do estorno<Input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
        <Button variant="danger" disabled={reason.trim().length < 3} onClick={() => submit("reverse")}>Estornar registro</Button>
      </fieldset>}
      <h3 className="font-semibold">Histórico de pagamentos</h3>
      {history.isPending && <p>Carregando...</p>}
      {history.isError && <Button onClick={() => void history.refetch()}>Tentar carregar histórico</Button>}
      {history.data?.length === 0 && <p>Nenhum pagamento registrado.</p>}
      {history.data?.map(payment => <article key={payment.id} className="rounded border p-3 space-y-1">
        <p>{money(payment.total_cents)} — {new Date(payment.paid_at).toLocaleString("pt-BR")} — {paymentMethodOptions.find(p => p.value === payment.payment_method)?.label || "Forma não informada"}</p>
        <p>{payment.origin === "legacy" ? "Registro anterior ao histórico; autor desconhecido" : `Registrado por ${payment.actor_name}`}</p>
        <p className="text-sm">Registro: {new Date(payment.recorded_at).toLocaleString("pt-BR")}</p>
        {payment.reversal ? <p>Estornado em {new Date(payment.reversal.recorded_at).toLocaleString("pt-BR")} por {payment.reversal.actor_name}: {payment.reversal.reason}</p> : <p>Pagamento ativo</p>}
      </article>)}
      <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>Fechar</Button>
    </div>
  </Modal>;
}
