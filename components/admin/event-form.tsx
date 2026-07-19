"use client";

import { useActionState, useEffect, useState } from "react";
import { createEventAction } from "@/app/admin/eventos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  EMPTY_EVENT_FORM,
  type EventFieldErrors,
  type EventFormValues,
  isInThePast,
  lisbonInstant,
  PAST_START_MESSAGE,
  todayInLisbon,
  validateEventForm,
} from "@/lib/event-rules";

const NO_ERRORS: EventFieldErrors = {};

/**
 * Criar evento — cria como rascunho, provisiona o live input na Cloudflare e
 * segue para a transmissão (onde vivem as credenciais do OBS).
 *
 * Três coisas que este formulário tem de garantir, porque já falharam:
 *
 *  - **Nada do que foi escrito se perde.** Os campos são controlados, por isso
 *    um erro de validação não lhes toca. (O React 19 faz reset ao form depois
 *    de correr uma action — era isso que limpava tudo.)
 *  - **Um clique, um evento.** O botão desativa mal o pedido arranca e só volta
 *    a si se houver erro; enquanto navega para a transmissão fica desativado.
 *    O servidor tem a sua própria guarda de duplicados — ver server/events.ts.
 *  - **Não se marca um evento para trás.** Avisa mal a hora escolhida já tenha
 *    passado, e o servidor volta a verificar antes de gravar.
 */
export function EventForm() {
  const [state, submit, isSubmitting] = useActionState(createEventAction, EMPTY_EVENT_FORM);
  // Valores do servidor à cabeça: sem JS, é assim que a submissão anterior
  // volta preenchida. Com JS, quem manda a partir daqui é o que se escreve.
  const [values, setValues] = useState<EventFormValues>(state.values);
  // `null` = o último veredito veio do servidor.
  const [clientErrors, setClientErrors] = useState<EventFieldErrors | null>(null);
  // Campos mexidos desde o último veredito: a queixa sobre eles cala-se até
  // haver nova submissão — ninguém quer ler "escolhe a data" com a data posta.
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  // Só depois de montar: o "hoje" do servidor e o do browser podiam não bater
  // certo à meia-noite, e um atributo diferente na hidratação é um erro.
  const [minDate, setMinDate] = useState<string>();

  useEffect(() => setMinDate(todayInLisbon()), []);

  function set(field: keyof EventFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setEdited((previous) => {
      if (previous.has(field)) return previous;
      const next = new Set(previous).add(field);
      // "já passou" é da data e da hora juntas: mexer numa reabre as duas.
      if (field === "date" || field === "time") next.add("startsAt");
      return next;
    });
  }

  // A hora escolhida já passou? Avisa enquanto se escreve, sem esperar pelo
  // submit. Só corre com data e hora preenchidas, nunca no primeiro render.
  const chosen = values.date && values.time ? lisbonInstant(values.date, values.time) : null;
  const alreadyPast = chosen !== null && isInThePast(chosen);

  const verdict = isSubmitting ? NO_ERRORS : (clientErrors ?? state.errors);
  const errors: EventFieldErrors = Object.fromEntries(
    Object.entries(verdict).filter(([field]) => !edited.has(field)),
  );
  const formError = isSubmitting || clientErrors ? "" : state.message;
  const startsAtError = errors.startsAt ?? (alreadyPast ? PAST_START_MESSAGE : undefined);

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        // A mesma validação que o servidor corre a seguir — esta é só para
        // responder na hora e poupar a ida ao servidor.
        setEdited(new Set());
        const checked = validateEventForm(values);
        if (checked.ok) {
          setClientErrors(null);
          return;
        }
        event.preventDefault();
        setClientErrors(checked.errors);
      }}
      className="grid items-start gap-5 lg:grid-cols-[1fr_380px]"
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>Detalhes do evento</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="event-title">Título</FieldLabel>
            <Input
              id="event-title"
              name="title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="SB Clash #15 — Regresso às aulas"
              aria-invalid={errors.title ? true : undefined}
            />
            <FieldError>{errors.title}</FieldError>
          </Field>
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-3.5">
              <Field>
                <FieldLabel htmlFor="event-date">Data</FieldLabel>
                <Input
                  id="event-date"
                  name="date"
                  type="date"
                  min={minDate}
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  className="font-mono"
                  aria-invalid={errors.date || startsAtError ? true : undefined}
                />
                <FieldError>{errors.date}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="event-time">Hora</FieldLabel>
                <Input
                  id="event-time"
                  name="time"
                  type="time"
                  value={values.time}
                  onChange={(e) => set("time", e.target.value)}
                  className="font-mono"
                  aria-invalid={errors.time || startsAtError ? true : undefined}
                />
                <FieldError>{errors.time}</FieldError>
              </Field>
            </div>
            <FieldError>{startsAtError}</FieldError>
            <FieldHint>Hora de Lisboa.</FieldHint>
          </div>
          {/* TODO(frente-d/roadmap): local, descrição e cartaz precisam de
              colunas novas em events — ficam para quando o schema as tiver. */}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Acesso à live</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="event-price">Preço PPV</FieldLabel>
              <div className="flex">
                <Input
                  id="event-price"
                  name="price"
                  inputMode="decimal"
                  value={values.price}
                  onChange={(e) => set("price", e.target.value)}
                  placeholder="7,50"
                  className="rounded-r-none text-right font-mono"
                  aria-invalid={errors.price ? true : undefined}
                />
                <span className="flex items-center rounded-r-sm border border-l-0 border-input bg-muted px-3.5 font-mono text-sm text-muted-foreground">
                  €
                </span>
              </div>
              <FieldError>{errors.price}</FieldError>
              <FieldHint>Uma compra dá acesso à live deste evento.</FieldHint>
            </Field>
          </CardContent>
        </Card>

        {/* TODO(frente-d): secção "Bilhetes físicos" (lotação + preço) entra
            quando a Frente D acrescentar ticket_price_cents/ticket_capacity. */}

        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "A criar evento…" : "Criar evento"}
            </Button>
            <FieldHint>
              Fica como rascunho. As credenciais OBS e o botão de pôr no ar estão na página de
              transmissão.
            </FieldHint>
            <FieldError>{formError}</FieldError>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
