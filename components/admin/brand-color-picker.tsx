"use client";

import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type DerivedBrand,
  derivePalette,
  formatContrast,
  parseHexColor,
  textColorOn,
} from "@/lib/colors";
import { cn } from "@/lib/utils";

/*
 * Escolha das cores da liga.
 *
 * A cor não se recusa: seja qual for a que a pessoa escolher, o sistema deriva
 * dela uma paleta legível (ver lib/colors.ts) e este ecrã diz o que fez e porquê.
 * O que aqui se mostra é o veredito da página do canal — fundo escuro —, que é
 * onde a cor da liga vive.
 *
 * Estado nunca é só cor: cada aviso tem ícone e frase, o preset escolhido leva
 * visto, e o rácio aparece em números. Quem não distingue as cores continua a
 * saber o que está escolhido e se passa.
 */

/**
 * Sugestões de arranque. Fogem de propósito ao limão da FirstRow (#eae04a) e ao
 * vermelho do AO VIVO (#e5372b): uma liga com essas cores confundia-se com a
 * plataforma e com o estado do direto.
 */
const PRESETS: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: "#6cc24a", name: "Verde" },
  { hex: "#2aa8a0", name: "Turquesa" },
  { hex: "#3b82c4", name: "Azul" },
  { hex: "#6d4ac2", name: "Roxo" },
  { hex: "#c2419b", name: "Magenta" },
  { hex: "#c2264b", name: "Carmim" },
  { hex: "#e07a1e", name: "Laranja" },
  { hex: "#b08948", name: "Dourado" },
];

/** Cor de arranque da segunda escolha: a primeira sugestão que não é a principal. */
function suggestSecondary(primary: string): string {
  const normalized = parseHexColor(primary);
  return (PRESETS.find((preset) => preset.hex !== normalized) ?? PRESETS[0]).hex;
}

// ── Uma cor ─────────────────────────────────────────────────────────────────

function ColorChoice({
  label,
  hint,
  value,
  onChange,
  error,
  action,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
  error?: string;
  /** Botão à direita do rótulo (remover a segunda cor, por exemplo). */
  action?: React.ReactNode;
}) {
  const groupId = useId();
  const hexId = `${groupId}-hex`;
  const errorId = `${groupId}-erro`;
  const normalized = parseHexColor(value);

  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={hexId}>{label}</FieldLabel>
        {action}
      </div>

      {/* Radios nativos: as setas do teclado navegam entre sugestões de graça. */}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{`${label} — sugestões`}</legend>
        {PRESETS.map((preset) => {
          const selected = normalized === preset.hex;
          return (
            <label
              key={preset.hex}
              className="relative flex cursor-pointer items-center justify-center"
            >
              <input
                type="radio"
                name={groupId}
                value={preset.hex}
                checked={selected}
                onChange={() => onChange(preset.hex)}
                className="peer sr-only"
              />
              <span
                // O visto (e não só a cor) é o que diz qual está escolhido.
                className={cn(
                  "flex size-11 items-center justify-center rounded-sm border transition-[box-shadow,border-color]",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2",
                  selected
                    ? "border-foreground shadow-[0_0_0_2px_var(--color-foreground)]"
                    : "border-input",
                )}
                style={{ backgroundColor: preset.hex }}
              >
                {selected ? (
                  <Check
                    className="size-4"
                    strokeWidth={3}
                    // Tinta ou papel, o que se ler sobre esta cor — mesma
                    // decisão que a paleta toma para texto sobre a marca.
                    style={{ color: textColorOn(preset.hex).color }}
                  />
                ) : null}
              </span>
              <span className="sr-only">{preset.name}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex gap-2">
        <input
          type="color"
          // Um valor inválido faz o browser queixar-se; enquanto se escreve o
          // hexadecimal à mão, o seletor fica na última cor que era válida.
          value={normalized ?? "#000000"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} — escolher no seletor do sistema`}
          className="size-11 shrink-0 cursor-pointer rounded-sm border border-input bg-field p-1 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-xs [&::-webkit-color-swatch]:border-0"
        />
        <Input
          id={hexId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#6CC24A"
          maxLength={7}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          inputMode="text"
          className="font-mono uppercase"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {hint && !error ? <FieldHint>{hint}</FieldHint> : null}
    </Field>
  );
}

// ── O veredito de contraste ─────────────────────────────────────────────────

function Swatch({ hex }: { hex: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 shrink-0 rounded-xs border border-input align-middle"
      style={{ backgroundColor: hex }}
    />
  );
}

/**
 * O que o sistema fez com a cor — em ícone, frase e número. Quando não mexeu em
 * nada também o diz: silêncio deixava a pessoa sem saber se tinha corrido bem.
 */
function ContrastVerdict({ derived }: { derived: DerivedBrand }) {
  const adjusted = derived.notices.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-sm border p-3",
        adjusted ? "border-warning/50 bg-warning/10" : "border-border bg-muted/40",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden className={cn("mt-0.5", adjusted ? "text-warning" : "text-success")}>
          {adjusted ? (
            <TriangleAlert className="size-4" strokeWidth={2.5} />
          ) : (
            <Check className="size-4" strokeWidth={3} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-2sm font-semibold">
            {adjusted ? "Ajustámos a cor para se poder ler" : "A cor escolhida cumpre o contraste"}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {formatContrast(derived.contrast.accent)} no texto ·{" "}
            {formatContrast(derived.contrast.onSolid)} nos blocos cheios · mínimo 4,50:1 (AA)
          </p>
        </div>
      </div>

      {derived.notices.map((notice) => (
        <p
          key={notice.role}
          className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-xs leading-relaxed text-foreground-secondary"
        >
          <Swatch hex={notice.from} />
          <span aria-hidden>→</span>
          <Swatch hex={notice.to} />
          <span className="min-w-0 flex-1">{notice.message}</span>
        </p>
      ))}
    </div>
  );
}

// ── O seletor ───────────────────────────────────────────────────────────────

export type BrandColorPickerProps = {
  accentColor: string;
  /** Vazio quando a liga só quer uma cor. */
  accentColorSecondary: string;
  onAccentChange: (hex: string) => void;
  onSecondaryChange: (hex: string) => void;
  errors?: { accentColor?: string; accentColorSecondary?: string };
};

export function BrandColorPicker({
  accentColor,
  accentColorSecondary,
  onAccentChange,
  onSecondaryChange,
  errors,
}: BrandColorPickerProps) {
  const hasSecondary = accentColorSecondary.trim() !== "";

  /*
   * O veredito é o da página do canal (fundo escuro). Só se calcula com a cor
   * principal já legível como hexadecimal — a meio de escrever "#6cc" o que
   * interessa é o erro do campo, não um veredito sobre uma cor que ninguém pediu.
   */
  const derived = useMemo<DerivedBrand | null>(() => {
    if (!parseHexColor(accentColor)) return null;
    return derivePalette(
      { accentColor, accentColorSecondary: hasSecondary ? accentColorSecondary : null },
      "dark",
    );
  }, [accentColor, accentColorSecondary, hasSecondary]);

  return (
    <div className="flex flex-col gap-4">
      <ColorChoice
        label="Cor da liga"
        hint="Usada em destaques da página do canal — nunca em botões de pagamento."
        value={accentColor}
        onChange={onAccentChange}
        error={errors?.accentColor}
      />

      {hasSecondary ? (
        <ColorChoice
          label="Segunda cor"
          hint="Entra no filete de topo, ao lado da primeira."
          value={accentColorSecondary}
          onChange={onSecondaryChange}
          error={errors?.accentColorSecondary}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSecondaryChange("")}
              // Fundo transparente, por isso os 44px de alvo de toque não pesam
              // à vista — continua a ler-se como uma ligação ao lado do rótulo.
              className="-my-2 -mr-2.5 h-11 px-2.5 text-xs"
            >
              <X aria-hidden className="size-3.5" />
              Remover
            </Button>
          }
        />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSecondaryChange(suggestSecondary(accentColor))}
          className="self-start"
        >
          <Plus aria-hidden className="size-4" />
          Juntar uma segunda cor
        </Button>
      )}

      {derived ? <ContrastVerdict derived={derived} /> : null}
    </div>
  );
}
