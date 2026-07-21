"use client";

import { useId, useRef, useState, useTransition } from "react";
import { deleteEventAction } from "@/app/admin/eventos/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { formatNumber } from "@/lib/format";

/** Porque é que este evento não pode ser apagado — decidido no servidor. */
export type DeleteBlock = { reason: "live" } | { reason: "sales"; sales: number };

/**
 * Apagar evento, com um diálogo que diz o que vai acontecer antes de acontecer
 * — incluindo a parte que custa dinheiro (o live input na Cloudflare).
 *
 * Quando o evento não pode ser apagado, o diálogo abre na mesma e explica
 * porquê: mais vale dizer do que esconder o botão e deixar o dono às voltas.
 * A recusa é sempre repetida no servidor (ver server/events.ts) — isto é só o
 * que se vê.
 *
 * `<dialog>` nativo: o Esc fecha, o foco fica preso lá dentro e o fundo fica
 * inerte sem precisarmos de escrever nada disso.
 */
export function DeleteEventDialog({
  eventId,
  title,
  blocked,
}: {
  eventId: string;
  title: string;
  blocked?: DeleteBlock;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function confirm() {
    setError("");
    startTransition(async () => {
      const result = await deleteEventAction(eventId);
      if (result.error) setError(result.error);
      else dialog.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
        className="alvo-toque cursor-pointer font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline"
      >
        Apagar
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        onClose={() => setError("")}
        // O diálogo vive dentro de uma célula numérica da tabela e herdava-lhe
        // o mono alinhado à direita — aqui manda a tipografia de texto.
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-sm border border-border bg-card p-0 text-left font-sans font-normal text-foreground backdrop:bg-graphite/50"
      >
        <div className="flex flex-col gap-3 p-5">
          {blocked ? (
            <>
              <h2 id={headingId} className="font-display text-base font-bold">
                {blocked.reason === "live"
                  ? "Este evento está no ar"
                  : "Este evento já tem compras"}
              </h2>
              <p className="text-2sm leading-relaxed text-muted-foreground">
                {blocked.reason === "live" ? (
                  <>
                    Termina a transmissão de <strong className="text-foreground">{title}</strong>{" "}
                    antes de o apagar — a meio da emissão, quem está a ver ficava sem nada.
                  </>
                ) : (
                  <>
                    São {formatNumber(blocked.sales)} {blocked.sales === 1 ? "compra" : "compras"}{" "}
                    em <strong className="text-foreground">{title}</strong>. Apagar o evento levava
                    atrás o registo de quem pagou. Se o evento não se realiza, termina-o e trata dos
                    reembolsos.
                  </>
                )}
              </p>
              <div className="mt-1 flex justify-end">
                <Button variant="secondary" onClick={() => dialog.current?.close()}>
                  Percebi
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 id={headingId} className="font-display text-base font-bold">
                Apagar “{title}”?
              </h2>
              <ul className="flex flex-col gap-1.5 text-2sm leading-relaxed text-muted-foreground">
                <li>Sai da lista de eventos e deixa de aparecer no canal.</li>
                <li>A stream é apagada na Cloudflare e deixa de contar na fatura.</li>
                <li>Não há como voltar atrás.</li>
              </ul>
              <FieldError>{error}</FieldError>
              {/* "Cancelar" primeiro no DOM de propósito: ao abrir, o browser
                  põe o foco no primeiro botão do diálogo — que tem de ser a
                  saída sem estragos, não o apagar. */}
              <div className="mt-1 flex justify-end gap-2.5">
                <Button
                  variant="secondary"
                  onClick={() => dialog.current?.close()}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={confirm} disabled={pending}>
                  {pending ? "A apagar…" : "Apagar evento"}
                </Button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
