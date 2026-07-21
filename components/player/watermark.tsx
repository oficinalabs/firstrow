"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  type Caixa,
  type EstadoDoEcraInteiro,
  molduraUtil,
  porqueFalha,
} from "@/components/player/watermark-check";

/*
 * ============================================================================
 *  MARCA DE ÁGUA POR ESPECTADOR — o que ela faz, e o que ela NUNCA vai fazer
 * ============================================================================
 *
 * Marca + email por cima do vídeo: dissuade quem filma o ecrã e identifica a
 * conta em qualquer gravação que apareça a circular.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  HONESTIDADE, PARA NINGUÉM VENDER ISTO ÀS LIGAS COMO O QUE NÃO É
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A marca vive no DOM, por cima de um iframe de outro domínio. Não está
 * gravada no vídeo, e não pode estar: a Cloudflare tem perfis de marca de água
 * mas só se aplicam a vídeos CARREGADOS — o live input não tem sequer esse
 * campo, e as gravações de direto herdam-no vazio. Marca por espectador
 * exigiria transcodificar um vídeo por pessoa, o que a esta escala não existe.
 *
 * Logo, a defesa possível não é "impedir": é **detetar e reagir**. Se a marca
 * sair do ecrã, a reprodução pára e a sessão é revogada no servidor (ver
 * `app/api/playback/[eventId]/marca/route.ts`). Remover a marca passa a custar
 * o vídeo, e fica registo com a conta à frente.
 *
 * O QUE ISTO NÃO APANHA — e não há volta a dar deste lado:
 *
 *  • Quem edita o nosso JS. O vigia é código nosso a correr no browser dele.
 *    Quem lhe puser um breakpoint, ou bloquear o pedido de aviso, ou correr a
 *    página com o JS desligado (fica sem player, mas ainda assim), passa. O
 *    alvo é a remoção casual pelo inspetor — que é 99% de quem tenta.
 *  • Ecrã inteiro NO iPHONE — e só aí. Em secretária (Chrome, Firefox, Safari)
 *    e em Android isto passou a estar coberto: o ecrã inteiro é pedido à
 *    MOLDURA e não ao iframe, por isso a marca vai lá dentro e continua a ser
 *    desenhada por cima do vídeo (medido nos três motores, com captura). O
 *    vigia já não se suspende em ecrã inteiro — pelo contrário, passou a saber
 *    distinguir "o ecrã inteiro levou a marca" de "deixou-a de fora".
 *    No iPhone não: lá não existe ecrã inteiro por elemento, e o vídeo pode
 *    entregar-se ao leitor NATIVO do sistema por uma API que vive dentro do
 *    iframe da Cloudflare. Esse leitor não é DOM nenhum — a marca não o
 *    acompanha e nós nem conseguimos VER que aconteceu. **Continua aberto no
 *    iPhone, e não há como o fechar deste lado.** Ver `fullscreen-button.tsx`.
 *  • Filmar o ecrã com um telemóvel. Nunca foi o alvo — aí a marca não impede,
 *    identifica. É para isso que ela tem o email lá dentro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  MOVIMENTO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Duas animações CSS ao mesmo tempo (`app/globals.css`): uma deriva contínua e
 * lenta, e o salto de posição de vez em quando. Em CSS, e não em JS, para que
 * matar o vigia não pare a marca — a coisa continua a mexer-se na mesma.
 *
 * As classes que ligam as animações são geradas a cada montagem em vez de
 * serem um nome fixo. Um nome fixo é um alvo de uma linha: bastava
 * `.wm-hop { display: none }` numa extensão de bloqueio, ou um filtro
 * partilhado num fórum, e ficava toda a gente sem marca sem sequer abrir o
 * inspetor. Com o nome a mudar, essa regra tem de ser reescrita a cada visita.
 */

/** Quantas verificações seguidas falhadas antes de cortar. */
const FALHAS_PARA_CORTAR = 2;

/** De quanto em quanto tempo o vigia olha (com ruído, ver abaixo). */
const INTERVALO_MS = 2500;

/**
 * ⚠️ A ALTURA DA MARCA NA PILHA — o que impede o chat sobreposto de parar o vídeo.
 *
 * A marca vive dentro da moldura do vídeo, mas o ecrã inteiro é pedido a um
 * elemento MAIOR (o palco, que leva a moldura *e* o chat — ver
 * `components/chat/palco-com-chat.tsx`). Nesse palco passa a haver interface
 * nossa desenhada por cima do vídeo, e uma pergunta nova: quem fica por cima
 * de quem.
 *
 * A resposta tinha de ser estrutural e não aritmética. O vigia corta quando
 * `elementsFromPoint` devolve alguém À FRENTE da marca (`tapada:…`), e "o chat
 * calha noutro sítio" é uma conta que depende da largura do ecrã, do tamanho do
 * email e de onde a animação parou. Aqui declara-se o contrário: **a marca é
 * desenhada acima de toda a interface da aplicação que partilhe o palco.** Se
 * um dia se cruzarem, quem fica à frente é a marca — continua a identificar a
 * sessão e o vigia não tem motivo para cortar.
 *
 * A defesa NÃO fica mais fraca por isto — fica mais explícita. O vigia continua
 * ligado e a olhar em ecrã inteiro; se alguém empurrar um elemento para cima da
 * marca (z-index maior, top layer, o que for), `quemTapa` vê-o e o vídeo pára
 * como sempre. O que se garante aqui é só que a NOSSA interface nunca é esse
 * alguém.
 *
 * A moldura não pode criar contexto de empilhamento próprio, ou este número
 * deixava de se comparar com o do chat: nada de `transform`, `filter`,
 * `opacity` ou `isolate` entre a marca e o palco. Está medido no relatório da
 * frente W e há teste que fixa a ordem.
 */
export const Z_MARCA = 15;

export type WatermarkProps = {
  /** O texto que identifica a conta — hoje o email do espectador. */
  label: string;
  /**
   * Chamado quando a marca deixou de estar visível. Recebe o que falhou, para
   * o registo do servidor. Sem isto, o vigia só observa e não reage.
   */
  onTampered?: (motivo: string) => void;
};

export function Watermark({ label, onTampered }: WatermarkProps) {
  /*
   * Âncora única por montagem, e mesmo essa sem estilos agarrados a ela.
   *
   * Aleatória e não `useId()`: o `useId` do React é sequencial (`r0`, `r1`),
   * o que é quase tão fixo como um nome escrito à mão. Aleatório é seguro aqui
   * porque a marca só existe depois do primeiro play — nunca é desenhada no
   * servidor, logo não há hidratação para desencontrar.
   */
  const [classeMarca] = useState(() => `wm-${Math.random().toString(36).slice(2, 10)}`);

  const marcaRef = useRef<HTMLSpanElement>(null);
  const avisado = useRef(false);
  const falhas = useRef(0);
  // Em ref para o vigia não ser remontado a cada render de quem o hospeda.
  const aoAdulterar = useRef(onTampered);
  aoAdulterar.current = onTampered;

  useEffect(() => {
    const marca = marcaRef.current;
    if (!marca) return;
    const moldura = marca.parentElement?.parentElement ?? null;

    const cortar = (motivo: string) => {
      if (avisado.current) return;
      avisado.current = true;
      aoAdulterar.current?.(motivo);
    };

    const falhou = (motivo: string) => {
      /*
       * O nó DESAPARECEU: corta já. Não há estado de página nenhum em que o
       * elemento se desligue do documento e volte — quando o componente
       * desmonta a sério, a limpeza deste efeito corre primeiro e o vigia já
       * cá não está. Logo, isto é sempre alguém a apagá-lo.
       */
      if (motivo === "removida") return cortar(motivo);

      falhas.current += 1;
      /*
       * Para o resto, duas falhas seguidas e não uma. Um falso positivo aqui
       * corta o vídeo a quem pagou — o erro caro é esse, não deixar passar um
       * segundo de marca escondida. Uma medição isolada apanha transições de
       * layout, mudanças de orientação e o instante entre dois frames.
       */
      if (falhas.current >= FALHAS_PARA_CORTAR) cortar(motivo);
    };

    /*
     * ⚠️ REENTRÂNCIA — o erro que travou o browser e não se via a ler o código.
     *
     * O teste de "quem está por cima" mexe no `style` da própria marca (ver
     * `quemTapa`). Como o observador de mutações vigia `style` em toda a
     * subárvore, essa mexida chamava o observador, que chamava a verificação,
     * que voltava a mexer no `style`… Ciclo infinito, síncrono: a página
     * ficava congelada e o vídeo nunca chegava a aparecer. Foi assim que
     * apareceu, ao medir — o código lia-se bem.
     *
     * Duas trancas, porque uma só deixava fresta: o sinalizador impede a
     * chamada de dentro da chamada, e o `takeRecords()` deita fora os registos
     * que nós próprios acabámos de gerar antes de o observador os ver.
     */
    let aVerificar = false;
    let observador: MutationObserver | null = null;

    const verificar = () => {
      if (avisado.current || aVerificar) return;

      /*
       * ECRÃ INTEIRO: o vigia DEIXOU DE SE SUSPENDER AQUI.
       *
       * Suspendia-se porque o elemento em ecrã inteiro era o iframe e a marca
       * ficava de fora — vigiar isso só servia para cortar o vídeo a quem
       * carregou no botão de sempre. Agora o ecrã inteiro é pedido à MOLDURA
       * (ver `fullscreen-button.tsx`), a marca vai lá dentro e é desenhada por
       * cima do vídeo na mesma. Deixou de haver motivo para fechar os olhos —
       * e é exatamente em ecrã inteiro que interessa estar de olhos abertos.
       *
       * O que se passa a distinguir é apenas se a marca vai, ou não vai, dentro
       * do que está em ecrã inteiro. Quem decide o que fazer com isso é
       * `porqueFalha`, onde está escrito o porquê.
       */
      const emEcraInteiro = document.fullscreenElement;
      const ecraInteiro: EstadoDoEcraInteiro = !emEcraInteiro
        ? "nenhum"
        : emEcraInteiro.contains(marca)
          ? "com-a-marca"
          : "sem-a-marca";

      /*
       * A moldura sem tamanho: a página está a mudar de layout, o elemento pai
       * foi escondido por um menu, o telemóvel rodou. Isto é estado da página,
       * não ataque — comparar contra a MOLDURA é o que impede o vigia de
       * disparar por causa do nosso próprio layout.
       *
       * NOTA: não se usa `document.hidden`. Foi o que aqui esteve, e mediu-se
       * que desligava o vigia por completo — num separador em segundo plano
       * (`visibilityState: "hidden"`) apagar a marca deixava de ter
       * consequência. Além disso era uma âncora de uma linha para quem
       * quisesse desligar isto de propósito. Um separador escondido não é
       * motivo para deixar de olhar: o `getBoundingClientRect` continua a
       * responder a verdade.
       */
      const molduraRect = moldura?.getBoundingClientRect();
      if (!molduraRect || !molduraUtil(molduraRect)) {
        falhas.current = 0;
        return;
      }

      aVerificar = true;
      try {
        const motivo = examinar(marca, molduraRect, label, ecraInteiro);
        if (motivo) falhou(motivo);
        else falhas.current = 0;
      } finally {
        observador?.takeRecords();
        aVerificar = false;
      }
    };

    /*
     * DUAS VIAS, porque uma só não chega.
     *
     * O observador de mutações apanha o caso instantâneo (apagar o nó, mexer
     * no `style`) sem esperar pelo relógio. A verificação periódica apanha o
     * que não é mutação nenhuma no nó: uma folha de estilo injetada, uma
     * classe do PAI, um elemento novo por cima, ou o nó movido para fora do
     * enquadramento. "Existe no DOM" não é a pergunta — a pergunta é "está a
     * ser desenhado onde deve, com que tamanho e por baixo de quê".
     */
    observador = new MutationObserver(() => {
      if (!marca.isConnected) falhou("removida");
      else verificar();
    });
    if (moldura) {
      observador.observe(moldura, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden"],
      });
    }

    /*
     * Ritmo com ruído: um intervalo certinho é previsível, e previsível é
     * contornável (esconder entre batidas). O ruído é barato e tira essa
     * certeza a quem tentar.
     */
    let temporizador: ReturnType<typeof setTimeout>;
    const agendar = () => {
      temporizador = setTimeout(
        () => {
          verificar();
          agendar();
        },
        INTERVALO_MS + Math.random() * 1500,
      );
    };

    // A primeira medição espera pelo layout — antes disso o rect é 0×0.
    const arranque = setTimeout(() => {
      verificar();
      agendar();
    }, 1200);

    return () => {
      observador?.disconnect();
      clearTimeout(arranque);
      clearTimeout(temporizador);
    };
  }, [label]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      // Ver `Z_MARCA` lá em cima: a marca fica acima da interface da app.
      style={{ zIndex: Z_MARCA }}
    >
      {/*
       * Estilos em `style` e não em classes utilitárias, de propósito. Um
       * conjunto de classes estáveis (`.font-mono.-rotate-12.text-2sm`) é um
       * seletor que qualquer um escreve uma vez e partilha num fórum. Assim a
       * única âncora é a classe aleatória — e essa não tem estilos agarrados,
       * por isso apagá-la também não faz nada.
       *
       * Os `@keyframes` ficam em `app/globals.css`: o movimento é CSS puro e
       * continua mesmo que o vigia lá em cima seja morto.
       */}
      <span
        ref={marcaRef}
        className={classeMarca}
        style={{
          position: "absolute",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-2sm)",
          color: "color-mix(in oklab, var(--color-bar-foreground) 30%, transparent)",
          transform: "rotate(-12deg)",
          animation: "wm-drift 41s linear infinite, wm-hop 313s step-end infinite",
        }}
      >
        <Image src="/brand/firstrow-watermark.svg" alt="" width={16} height={16} />
        {label} · FirstRow
      </span>
    </div>
  );
}

/**
 * Lê o DOM e pergunta a `porqueFalha` se aquilo é aceitável.
 *
 * A leitura é aqui porque só um browser sabe o que é um `opacity` calculado ou
 * quem está desenhado por cima de quem; a decisão está em `watermark-check.ts`
 * porque é lá que vivem os limiares, e limiares querem-se testados.
 */
function examinar(
  marca: HTMLElement,
  moldura: DOMRect,
  label: string,
  ecraInteiro: EstadoDoEcraInteiro,
): string | null {
  if (!marca.isConnected) return "removida";

  const estilo = getComputedStyle(marca);
  const rect = marca.getBoundingClientRect();

  return porqueFalha(
    {
      ligada: true,
      texto: marca.textContent ?? "",
      display: estilo.display,
      visibility: estilo.visibility,
      opacidade: Number.parseFloat(estilo.opacity),
      caixa: caixa(rect),
      moldura: caixa(moldura),
      // Só se pergunta quem tapa depois de o resto passar: é o teste caro
      // (força recálculo de estilo) e o mais raro de disparar.
      tapadaPor: quemTapa(marca, rect),
      ecraInteiro,
    },
    label,
  );
}

const caixa = (r: DOMRect): Caixa => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

/**
 * Alguém desenhou por cima? Devolve o nome do elemento que tapa, ou `null`.
 *
 * `elementsFromPoint` devolve a pilha do ponto, do topo para baixo — o que
 * aparecer ANTES da marca está desenhado por cima dela. O truque do
 * `pointerEvents` é preciso porque a camada da marca é `pointer-events: none`
 * (tem de ser: senão os controlos do player deixavam de receber cliques), e
 * elementos assim são ignorados por esta API. Ligamo-lo e desligamo-lo dentro
 * da mesma tarefa síncrona, onde nenhum clique se pode intrometer.
 */
function quemTapa(marca: HTMLElement, rect: DOMRect): string | null {
  const anterior = marca.style.pointerEvents;
  marca.style.pointerEvents = "auto";
  const pilha = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  marca.style.pointerEvents = anterior;

  const indice = pilha.findIndex((el) => el === marca || marca.contains(el));
  // Não está na pilha: ou está fora da janela (já testado) ou está tapada por
  // algo que a API nem enumerou. Conservador — não inventamos um culpado.
  if (indice === -1) return null;

  for (const acima of pilha.slice(0, indice)) {
    if (acima.contains(marca)) continue; // um antepassado não tapa o filho
    return acima.tagName.toLowerCase();
  }
  return null;
}
