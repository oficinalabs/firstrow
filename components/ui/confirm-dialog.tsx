"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

/*
 * Confirmação de uma ação que não se desfaz.
 *
 * `<dialog>` nativo, e não uma <div> com `position:fixed`: o Esc fecha, o foco
 * fica preso lá dentro, o fundo fica inerte e o browser devolve o foco ao
 * elemento de origem quando isto fecha — tudo sem uma linha nossa.
 *
 * ABERTO POR PROP, e não por um gatilho aqui dentro. Numa tabela, o que decide
 * o que este diálogo diz não é o botão que se carregou — é a LINHA em que se
 * carregou, e esse estado já vive em quem chama. Com o gatilho cá dentro, ou se
 * montava um diálogo por linha (n cópias do mesmo <dialog> no DOM), ou se
 * inventava um botão invisível para o abrir de fora. Assim é um só, e o `open`
 * é apenas mais um pedaço do estado que o pai já tinha.
 *
 * O CORPO diz o que vai ACONTECER, não o que se está a fazer. "Deixa de ver os
 * eventos e o dinheiro deste canal" é uma consequência; "tens a certeza?" é uma
 * pergunta sem informação nenhuma.
 */
export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** As consequências, em texto corrido ou em lista. */
  children: React.ReactNode;
  confirmLabel: string;
  /** O rótulo enquanto o pedido corre — o botão nunca fica mudo. */
  pendingLabel: string;
  /** Vermelho para o que retira acesso ou apaga; por omissão, ação normal. */
  destructive?: boolean;
  pending?: boolean;
  /** Erro devolvido pelo servidor. Fica DENTRO do diálogo, junto à ação. */
  error?: string;
  onConfirm: () => void;
  /** Esc, clique em Cancelar, ou fecho por qualquer outra via. */
  onDismiss: () => void;
};

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pendingLabel,
  destructive = false,
  pending = false,
  error,
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // `showModal()` duas vezes seguidas atira; daí o par de guardas.
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      // A meio do pedido o Esc não fecha: fechar aqui deixava a pessoa sem ver
      // o resultado de uma escrita que está mesmo a acontecer.
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={onDismiss}
      // Estes diálogos vivem dentro de células de tabela, que são mono e
      // alinhadas à direita — aqui manda a tipografia de texto.
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-sm border border-border bg-card p-0 text-left font-sans font-normal text-foreground backdrop:bg-graphite/50"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={headingId} className="font-display text-base font-bold">
          {title}
        </h2>
        <div className="flex flex-col gap-1.5 text-2sm leading-relaxed text-muted-foreground">
          {children}
        </div>
        <FieldError>{error}</FieldError>
        {/* "Cancelar" primeiro no DOM de propósito: ao abrir, o browser põe o
            foco no primeiro botão do diálogo — que tem de ser a saída sem
            estragos, não a ação que não se desfaz. */}
        <div className="mt-1 flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onDismiss} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
