"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  ECRÃ INTEIRO — o nosso, e não o do iframe
 * ============================================================================
 *
 * PORQUE É QUE ISTO EXISTE. O vídeo é um iframe de outro domínio e a marca de
 * água é nossa, desenhada por cima dele. Quando o elemento que vai a ecrã
 * inteiro é o IFRAME, o sistema desenha só o iframe: tudo o que esteja de fora
 * — a marca incluída — deixa de existir no ecrã. A marca desaparecia sem
 * ninguém lhe tocar, e quem quisesse gravar uma cópia limpa só tinha de
 * carregar num botão.
 *
 * A correção é escolher OUTRO elemento: pedimos ecrã inteiro à MOLDURA, o
 * `<div>` que contém o iframe **e** a marca. O sistema desenha a moldura
 * inteira, e a marca continua por cima do vídeo. Para isso o iframe deixou de
 * levar `allowfullscreen` (ver `watch-player.tsx`), o que tem um efeito
 * lateral feliz e medido: o player da Cloudflare esconde sozinho o botão de
 * ecrã inteiro dele. Não sobra um botão partido a enganar ninguém.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  ONDE ISTO NÃO CHEGA — e não há maneira de lá chegar deste lado
 * ────────────────────────────────────────────────────────────────────────────
 *
 * No iPHONE não existe ecrã inteiro por elemento: o `requestFullscreen` não
 * está sequer definido nos elementos (medido no motor do WebKit com perfil de
 * iPhone). O que existe é o vídeo entregar-se ao leitor NATIVO do sistema, por
 * `video.webkitEnterFullscreen()` — uma API que vive DENTRO do iframe da
 * Cloudflare e que a política de permissões do nosso iframe não governa.
 *
 * Daí a decisão: **o botão só é desenhado onde a API existe.** No iPhone não
 * aparece — mostrar um botão que não faz nada é pior do que não ter botão.
 * Se o player da Cloudflare oferecer lá o atalho nativo dele, o vídeo sai para
 * o leitor do sistema e a marca não vai com ele. Não conseguimos impedir isso
 * (o controlo é de outro domínio) nem sequer VER que aconteceu (o leitor
 * nativo não acende `fullscreenElement` nenhum na nossa página).
 *
 * Escolheu-se não fingir o contrário. As defesas que continuam de pé no iPhone
 * são as de sempre — login obrigatório, uma sessão de cada vez, token por
 * conta — e a marca continua lá enquanto o vídeo estiver embutido na página,
 * que é como ele começa sempre.
 */

/**
 * A API de ecrã inteiro por elemento existe neste browser?
 *
 * Por deteção de funcionalidade e não por user-agent, de propósito: o iPad com
 * iPadOS moderno diz-se um Mac no user-agent e **suporta** ecrã inteiro por
 * elemento. Farejar o UA tirava-lhe o botão sem motivo.
 */
function temEcraInteiro(): boolean {
  if (typeof document === "undefined") return false;
  return (
    typeof document.documentElement.requestFullscreen === "function" &&
    document.fullscreenEnabled === true
  );
}

/**
 * Estamos em ecrã inteiro NESTE elemento?
 *
 * Está aqui, e exportado, porque deixou de haver um só interessado: além do
 * ícone do botão, o palco precisa de saber (é ele que troca a grelha de duas
 * colunas pelo chat sobreposto — ver `components/chat/palco-com-chat.tsx`).
 *
 * Um só sítio a ler o estado, e a lê-lo ao BROWSER: sair por `Esc`, pelo gesto
 * do sistema ou por outro separador tem de chegar aos dois ao mesmo tempo. Dois
 * palpites separados davam um ícone e um painel a discordarem um do outro — e
 * o que discorda aqui é o que fica com o chat aberto sobre uma página que já
 * saiu do ecrã inteiro.
 */
export function useDentroDoEcraInteiro(alvo: React.RefObject<HTMLElement | null>): boolean {
  const [dentro, setDentro] = useState(false);

  useEffect(() => {
    const aoMudar = () => setDentro(document.fullscreenElement === alvo.current);
    // Também à montagem: montar já dentro do ecrã inteiro é raro, mas o estado
    // ficava a mentir até ao evento seguinte.
    aoMudar();
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, [alvo]);

  return dentro;
}

export type FullscreenButtonProps = {
  /**
   * O elemento que vai a ecrã inteiro. TEM de conter o iframe e a marca — é
   * essa a defesa toda. Hoje é o palco (vídeo + chat); antes era a moldura.
   * Se alguém lhe passar um elemento que deixe a marca de fora, o vigia vê
   * (`ecraInteiro: "sem-a-marca"`) e o vídeo pára — o erro é ruidoso.
   */
  alvo: React.RefObject<HTMLElement | null>;
  className?: string;
};

export function FullscreenButton({ alvo, className }: FullscreenButtonProps) {
  /*
   * Só depois de montar. `fullscreenEnabled` não existe no servidor, e decidir
   * isto durante o render do servidor dava uma marca de hidratação diferente da
   * do cliente.
   */
  const [suportado, setSuportado] = useState(false);
  const dentro = useDentroDoEcraInteiro(alvo);

  useEffect(() => setSuportado(temEcraInteiro()), []);

  const alternar = useCallback(() => {
    const el = alvo.current;
    if (!el) return;
    if (document.fullscreenElement) {
      // Pode falhar se já se saiu por outra via — não há nada a fazer nem a dizer.
      void document.exitFullscreen().catch(() => {});
      return;
    }
    /*
     * `navigationUI: "hide"` pede ao browser para esconder a barra de endereço
     * onde isso é possível (Android). Onde não for, é ignorado — não é erro.
     */
    void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }, [alvo]);

  /*
   * As teclas: `f` alterna, `Esc` sai. Como em qualquer leitor de vídeo.
   *
   * A GUARDA QUE NÃO PODE FALTAR: esta página tem chat — mediu-se, a caixa de
   * mensagens está mesmo lá (`<textarea placeholder="Escreve um comentário">`).
   * Sem verificar onde está o foco, escrever "fixe" atirava a pessoa para ecrã
   * inteiro a meio da palavra. Também se ignoram as combinações com modificador
   * (`Ctrl+F` é procurar, e continua a ser).
   *
   * PORQUÊ TRATAR DO `Esc` SE O BROWSER JÁ O FAZ. Faz, e continua a fazer — o
   * `Esc` do ecrã inteiro é do agente do utilizador e a página nem sequer o
   * consegue impedir. Isto é um segundo caminho, não o primeiro: chamar
   * `exitFullscreen()` quando já se saiu não faz nada, e ter o comportamento
   * escrito aqui torna-o verificável em vez de ficar dependente de uma parte do
   * browser que os testes não conseguem acionar.
   */
  useEffect(() => {
    if (!suportado) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        return;
      }
      if (e.key !== "f" && e.key !== "F") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const foco = document.activeElement as HTMLElement | null;
      if (foco) {
        const tag = foco.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || foco.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      alternar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [suportado, alternar]);

  if (!suportado) return null;

  const rotulo = dentro ? "Sair do ecrã inteiro" : "Ver em ecrã inteiro";

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={rotulo}
      title={`${rotulo} (f)`}
      aria-keyshortcuts="f"
      className={cn(
        /*
         * 44×44 de alvo — o mínimo para um dedo. O ícone é bem mais pequeno do
         * que isso; o que tem de ter 44px é a área que recebe o toque, não o
         * desenho.
         */
        "absolute right-3 top-3 z-20 inline-flex size-11 cursor-pointer items-center justify-center rounded-sm",
        // Fundo próprio: o vídeo por baixo pode ser claro ou escuro, e um ícone
        // sem fundo desaparecia em metade dos frames.
        "bg-bar/55 text-bar-foreground transition-colors hover:bg-bar/85",
        // O foco é o do resto da app (anel limão global) — só não pode ser tapado.
        "focus-visible:bg-bar/85",
        className,
      )}
    >
      {dentro ? <IconeSair /> : <IconeEntrar />}
    </button>
  );
}

/*
 * Os dois ícones: quatro cantos a abrir, quatro cantos a fechar. Mesma
 * linguagem do resto (traço de 2, `currentColor`, sem preenchimento) e sem
 * emoji — um emoji aqui muda de desenho conforme o sistema e nunca combina
 * com o resto.
 */
function IconeEntrar() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  );
}

function IconeSair() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 4v4a1 1 0 0 1-1 1H4" />
      <path d="M15 4v4a1 1 0 0 0 1 1h4" />
      <path d="M9 20v-4a1 1 0 0 0-1-1H4" />
      <path d="M15 20v-4a1 1 0 0 1 1-1h4" />
    </svg>
  );
}
