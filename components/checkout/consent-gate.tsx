"use client";

import type { CopiaCliente } from "@/lib/legal/consentimentos";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  CONSENTIMENTO NO CHECKOUT — um componente, os três casos
 * ============================================================================
 *
 * A secção 6 de `docs/legal/CONTEUDO-PAGINAS.md` tem três variantes:
 *
 *   bilhete → só texto informativo, SEM checkbox (a exceção legal vem de o
 *             evento ter data marcada, não de um consentimento expresso).
 *   ppv     → texto informativo + checkbox obrigatória de renúncia.
 *   vod     → só a checkbox obrigatória de renúncia (é a renúncia expressa aos
 *             14 dias sobre conteúdo já gravado).
 *
 * São o mesmo componente, não três — a diferença é dados (`copy.checkbox` é
 * `null` no bilhete). Assim a regra "checkbox nunca pré-marcada" e "distinta do
 * aceite genérico dos termos" vive num sítio só.
 *
 * QUEM MANDA É O SERVIDOR. Este componente ajuda quem está de boa-fé — mostra o
 * texto, e desativa o botão até a checkbox estar marcada. Mas o botão desativado
 * é conforto: a garantia é a validação no servidor (ver as rotas de checkout).
 *
 * ACESSIBILIDADE
 *  - `<input type="checkbox">` nativo: teclado e leitor de ecrã de borla.
 *  - foco visível pelo ring global (ver globals.css).
 *  - o estado de erro não fala só por cor: leva `role="alert"` com texto, e o
 *    input ganha `aria-invalid`.
 */

export type Props = {
  copy: CopiaCliente;
  /** Estado da checkbox — só conta quando `copy.checkbox != null`. */
  accepted?: boolean;
  onAcceptedChange?: (accepted: boolean) => void;
  /** Mensagem de erro do servidor (ex.: submeteu sem marcar). Vazio = sem erro. */
  error?: string;
  /** Prefixo de id, para páginas com mais do que um bloco na mesma árvore. */
  idPrefix?: string;
};

export function ConsentGate({ copy, accepted, onAcceptedChange, error, idPrefix }: Props) {
  const checkboxId = `${idPrefix ?? "consent"}-${copy.kind}`;
  const errorId = `${checkboxId}-erro`;

  return (
    <div className="flex flex-col gap-2.5">
      {copy.informativo.map((paragrafo) => (
        <p key={paragrafo} className="text-2sm leading-relaxed text-foreground-secondary">
          {paragrafo}
        </p>
      ))}

      {copy.checkbox !== null ? (
        <div className="flex flex-col gap-1.5">
          {/*
           * Caixa própria com borda: é o que a torna "visualmente distinta" do
           * aceite genérico dos termos (a linha de texto por baixo do botão),
           * como a secção 6 exige. São consentimentos juridicamente diferentes.
           */}
          <label
            htmlFor={checkboxId}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors",
              error ? "border-destructive bg-destructive/5" : "border-input bg-muted/30",
            )}
          >
            <input
              id={checkboxId}
              type="checkbox"
              // NUNCA pré-marcada: `checked` vem do estado do pai, que arranca a
              // false. O default do React para checkbox controlada é isto mesmo.
              checked={accepted ?? false}
              onChange={(e) => onAcceptedChange?.(e.target.checked)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="mt-0.5 size-5 shrink-0 rounded-xs border-input [accent-color:var(--primary)]"
            />
            <span className="text-2sm leading-relaxed text-foreground">{copy.checkbox}</span>
          </label>

          {error ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
