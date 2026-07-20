"use client";

import { Button } from "@/components/ui/button";
import type { ChatAuthorRole, ChatMessageView } from "@/lib/chat";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Uma mensagem — na live e no arquivo, é a mesma linha.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O DISTINTIVO DE DONO/STAFF DIZ O QUE É POR ESCRITO, NÃO SÓ POR COR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O pedido era que o dono e a equipa da liga se distingam dos clientes comuns,
 * com a cor do canal (`--tenant`). A cor está lá — mas sozinha não servia:
 * quem não distingue as cores, quem tem o ecrã ao sol, e qualquer leitor de
 * ecrã ficavam sem a informação. Por isso o distintivo é uma ETIQUETA COM
 * PALAVRA ("DONO", "EQUIPA"); a cor é o reforço, nunca o portador.
 *
 * O papel vem de `channel_members`, resolvido no servidor contra o canal DESTE
 * evento — nunca uma lista de emails em código, e nunca "tem papel nalgum
 * canal". Ver o `leftJoin` em `server/chat.ts`.
 */

const ETIQUETA_PAPEL: Record<Exclude<ChatAuthorRole, null>, string> = {
  owner: "Dono",
  staff: "Equipa",
};

export type ChatMessageRowProps = {
  message: ChatMessageView;
  /** O id de quem está a ver — para marcar as próprias mensagens. */
  viewerId: string;
  /** Mostra as ações de moderação. */
  moderator: boolean;
  onDelete(message: ChatMessageView): void;
  onMute(message: ChatMessageView): void;
  /** Uma ação de moderação em curso nesta mensagem. */
  busy: boolean;
};

export function ChatMessageRow({
  message,
  viewerId,
  moderator,
  onDelete,
  onMute,
  busy,
}: ChatMessageRowProps) {
  const papel = message.authorRole;
  const eu = message.authorId === viewerId;
  const podeModerar = moderator && !eu;

  return (
    <li
      className={cn(
        "group relative px-3 py-1.5 leading-snug",
        // A própria mensagem ganha um filete à esquerda: dá para a encontrar
        // num ecrã cheio sem depender de a cor ser percebida.
        eu && "border-l-2 border-input bg-muted/25 pl-[calc(--spacing(3)-2px)]",
      )}
    >
      <p className="text-2sm">
        <span className="align-baseline font-mono text-2xs text-muted-foreground/70 tabular-nums">
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>{" "}
        </span>
        <span className={cn("font-semibold", papel ? "text-(--tenant)" : "text-foreground")}>
          {message.authorName}
        </span>
        {papel ? (
          <>
            {" "}
            <span className="inline-flex -translate-y-px items-center rounded-xs border border-(--tenant)/60 px-1 align-middle font-mono text-[0.625rem] font-semibold uppercase leading-[1.4] tracking-label text-(--tenant)">
              {ETIQUETA_PAPEL[papel]}
            </span>
          </>
        ) : null}
        <span className="text-muted-foreground/60">: </span>
        {/* `break-words` porque um URL colado sem espaços não pode empurrar a
            conversa toda para fora do ecrã de um telemóvel. */}
        <span className="break-words text-foreground-secondary">{message.body}</span>
      </p>

      {podeModerar ? (
        /*
         * As ações ficam sempre no DOM e sempre focáveis — só a opacidade muda.
         * Escondê-las com `hidden` tirava-as ao teclado, e a moderação feita ao
         * teclado é a de quem está a gerir a régie com uma mão no telemóvel.
         */
        <span className="absolute top-1 right-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 bg-background/90 px-2 text-2xs"
            disabled={busy}
            onClick={() => onDelete(message)}
          >
            Apagar
            <span className="sr-only"> a mensagem de {message.authorName}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 bg-background/90 px-2 text-2xs"
            disabled={busy}
            onClick={() => onMute(message)}
          >
            Silenciar
            <span className="sr-only"> {message.authorName} neste evento</span>
          </Button>
        </span>
      ) : null}
    </li>
  );
}
