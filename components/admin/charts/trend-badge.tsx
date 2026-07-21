import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Trend } from "@/server/stats";

/*
 * ============================================================================
 *  O INDICADOR DE TENDÊNCIA — há UM, e é reutilizado em todos os cartões
 * ============================================================================
 *
 * A regra do dono: cor E texto, NUNCA só cor. Quem não distingue verde de
 * vermelho — e qualquer leitor de ecrã — tem de perceber a direção sem depender
 * da cor. Por isso a peça diz o mesmo de três formas redundantes:
 *
 *   · uma SETA desenhada (lucide, não emoji) — direção sem cor;
 *   · a PALAVRA ("subiu"/"desceu"/"sem mudança"/"novo") — direção em texto;
 *   · a PERCENTAGEM — quanto.
 *
 * E um texto só-para-leitor-de-ecrã junta tudo numa frase, porque a seta e a cor
 * não se ouvem. O que se vê é curto; o que se ouve é a frase inteira.
 *
 * SEM PERÍODO ANTERIOR (anterior a zero, atual > 0) não se inventa "+100 %":
 * "novo" é a verdade. Uma seta para cima sobre uma divisão por zero era uma
 * mentira com ar de facto — precisamente o que esta sessão persegue.
 */

type Direcao = "subiu" | "desceu" | "igual" | "novo" | "nenhuma";

export function TrendBadge({
  trend,
  invert = false,
  className,
}: {
  trend: Trend;
  /**
   * Para métricas onde DESCER é bom (menos bloqueios, menos risco): troca a cor,
   * não o texto nem a seta. Hoje nenhuma tendência de topo o usa — são todas
   * "mais é melhor" — mas fica para a próxima não pintar o vermelho como vitória
   * à mão.
   */
  invert?: boolean;
  className?: string;
}) {
  const { current, deltaRatio } = trend;

  const direcao: Direcao =
    deltaRatio === null
      ? current > 0
        ? "novo"
        : "nenhuma"
      : deltaRatio > 0
        ? "subiu"
        : deltaRatio < 0
          ? "desceu"
          : "igual";

  // A cor segue se a variação é BOA ou MÁ, e não a direção crua — é `invert` que
  // as separa. `null` para os casos sem juízo (igual, novo, sem atividade).
  const bom = direcao === "subiu" ? !invert : direcao === "desceu" ? invert : null;
  const tomClasse =
    bom === null ? "text-muted-foreground" : bom ? "text-success" : "text-destructive";

  const Icone = direcao === "subiu" ? ArrowUp : direcao === "desceu" ? ArrowDown : Minus;
  const percentagem =
    direcao === "subiu" || direcao === "desceu" ? formatPercent(Math.abs(deltaRatio ?? 0)) : null;

  const palavra: Record<Direcao, string> = {
    subiu: "subiu",
    desceu: "desceu",
    igual: "sem mudança",
    novo: "novo",
    nenhuma: "sem atividade",
  };

  // A frase que o leitor de ecrã ouve — a única leitura que não vê seta nem cor.
  const frase =
    direcao === "novo"
      ? "Novo neste período — sem período anterior para comparar."
      : direcao === "nenhuma"
        ? "Sem atividade neste período nem no anterior."
        : direcao === "igual"
          ? "Sem mudança face ao período anterior."
          : `${direcao === "subiu" ? "Subiu" : "Desceu"} ${percentagem} face ao período anterior.`;

  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", tomClasse, className)}>
      <Icone aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.5} />
      <span aria-hidden="true" className="tabular-nums">
        {palavra[direcao]}
        {percentagem ? ` ${percentagem}` : ""}
      </span>
      <span className="sr-only">{frase}</span>
    </span>
  );
}
