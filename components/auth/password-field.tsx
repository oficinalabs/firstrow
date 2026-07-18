"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { checkPassword, PASSWORD_RULES, type PasswordContext } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

/*
 * Campo de password com checklist em tempo real (registo e redefinição).
 *
 * As regras vêm de `lib/password-policy.ts` — o MESMO módulo que o servidor
 * usa para decidir. Isto aqui é só o espelho: mostra o que falta enquanto se
 * escreve, para ninguém descobrir as regras à força de erros.
 */

export function PasswordChecklist({
  password,
  context,
  id,
}: {
  password: string;
  context: PasswordContext;
  id?: string;
}) {
  const { passed } = checkPassword(password, context);

  return (
    <ul id={id} aria-label="Requisitos da password" className="mt-0.5 flex flex-col gap-1">
      {PASSWORD_RULES.map((rule) => {
        const ok = passed.includes(rule.id);
        return (
          <li key={rule.id} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className={cn(
                "flex size-3.5 shrink-0 items-center justify-center transition-colors",
                ok ? "text-success" : "text-muted-foreground/50",
              )}
            >
              {ok ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <span className="size-1 rounded-full bg-current" />
              )}
            </span>
            <span
              className={cn("transition-colors", ok ? "text-foreground" : "text-muted-foreground")}
            >
              {rule.label}
            </span>
            <span className="sr-only">{ok ? "— cumprido" : "— em falta"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function PasswordField({
  value,
  onChange,
  context,
  error,
  label = "Password",
  name = "password",
  autoComplete = "new-password",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Email/nome do formulário — recusa passwords feitas dos próprios dados. */
  context: PasswordContext;
  error?: string | null;
  label?: string;
  name?: string;
  autoComplete?: string;
}) {
  const fieldId = useId();
  const checklistId = `${fieldId}-regras`;
  const errorId = `${fieldId}-erro`;

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input
        id={fieldId}
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${errorId} ${checklistId}` : checklistId}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      <PasswordChecklist password={value} context={context} id={checklistId} />
    </Field>
  );
}
