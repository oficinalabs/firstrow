"use client";

import { Heart, Link2, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LikeState } from "@/lib/chat";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  GOSTO E PARTILHA
 * ============================================================================
 *
 * GOSTO — contagem pública, identidade privada (decisão do dono). O componente
 * nunca recebe nem mostra QUEM gostou: recebe um número e um booleano sobre a
 * própria conta, que é tudo o que o servidor expõe.
 *
 * Quem não tem sessão VÊ a contagem e não vota — e em vez de um botão morto
 * (que não explica nada e nem sequer recebe foco), leva um link para entrar com
 * o destino de volta. Um "não podes" que diz como se pode.
 *
 * PARTILHA — o link é SEMPRE a página pública do evento, nunca a de ver.
 * Partilhar `/eventos/<id>/ver` mandava as pessoas para um sítio onde só entra
 * quem já comprou: quem recebesse o link levava com um redireccionamento em vez
 * da página que vende o evento. O `shareUrl` vem montado do servidor, que é
 * quem sabe o domínio público.
 */

/** Quanto tempo fica a confirmação de "link copiado". */
const CONFIRMACAO_MS = 2_400;

export type LikeShareProps = {
  eventId: string;
  initial: LikeState;
  /** Há sessão? Sem ela mostra-se a contagem e um convite a entrar. */
  signedIn: boolean;
  /** A página PÚBLICA do evento, absoluta. Nunca a de ver. */
  shareUrl: string;
  shareTitle: string;
  /** Título + descrição do evento — o texto que acompanha a partilha. */
  shareText: string;
  className?: string;
};

export function LikeShare({
  eventId,
  initial,
  signedIn,
  shareUrl,
  shareTitle,
  shareText,
  className,
}: LikeShareProps) {
  const [estado, setEstado] = useState<LikeState>(initial);
  const [aVotar, setAVotar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /*
   * `navigator.share` não existe no servidor, por isso NÃO pode ser lido durante
   * o render: o servidor pintava o ícone de copiar, o cliente o de partilhar, e
   * o React acusava a divergência na hidratação. Fica a `false` até haver
   * browser — o primeiro render é igual dos dois lados, e só depois muda.
   */
  const [partilhaNativa, setPartilhaNativa] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPartilhaNativa(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  function anunciar(texto: string) {
    setAviso(texto);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), CONFIRMACAO_MS);
  }

  async function alternarGosto() {
    if (aVotar) return;
    setAVotar(true);

    // Otimista: o toque responde já. A resposta do servidor é a verdade e
    // corrige-o se divergir (dois separadores abertos, por exemplo).
    const anterior = estado;
    setEstado({
      liked: !anterior.liked,
      count: anterior.count + (anterior.liked ? -1 : 1),
    });

    try {
      const resposta = await fetch(`/api/gostos/${encodeURIComponent(eventId)}`, {
        method: "POST",
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error("falhou");
      setEstado((await resposta.json()) as LikeState);
    } catch {
      setEstado(anterior);
      anunciar("Não foi possível registar o gosto.");
    } finally {
      setAVotar(false);
    }
  }

  async function partilhar() {
    // Telemóvel: a folha de partilha nativa. É o caminho principal — as pessoas
    // veem batalhas no telemóvel e partilham-nas para o WhatsApp de lá.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch (falha) {
        // Cancelar a folha de partilha não é um erro — não se diz nada.
        if (falha instanceof DOMException && falha.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      anunciar("Link copiado.");
    } catch {
      anunciar("Copia o link da barra de endereço.");
    }
  }

  const rotuloGosto = estado.liked ? "Retirar o gosto" : "Gostar deste evento";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {signedIn ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={aVotar}
          aria-pressed={estado.liked}
          aria-label={rotuloGosto}
          onClick={() => void alternarGosto()}
          className={cn(estado.liked && "border-(--tenant) text-(--tenant)")}
        >
          <Heart aria-hidden className={cn(estado.liked && "fill-current")} />
          <span className="tabular-nums">{estado.count}</span>
          {/* O estado não pode ir só na cor nem só no preenchimento do ícone. */}
          <span className="sr-only">{estado.liked ? "— gostaste" : "gostos"}</span>
        </Button>
      ) : (
        <Link
          href={`/entrar?next=${encodeURIComponent(`/eventos/${eventId}`)}`}
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-input px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
        >
          <Heart aria-hidden />
          <span className="tabular-nums">{estado.count}</span>
          <span className="sr-only">gostos — entra na tua conta para gostar</span>
        </Link>
      )}

      <Button variant="secondary" size="sm" onClick={() => void partilhar()}>
        {partilhaNativa ? <Share2 aria-hidden /> : <Link2 aria-hidden />}
        {partilhaNativa ? "Partilhar" : "Copiar link"}
      </Button>

      {/* A confirmação é TEXTO, e é anunciada. Um ícone a mudar de cor deixava
          de fora quem não o vê — e é a única prova de que o link foi copiado. */}
      <p role="status" aria-live="polite" className="text-2xs text-muted-foreground">
        {aviso}
      </p>
    </div>
  );
}
