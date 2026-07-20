"use client";

import { Lock } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Channel } from "@/lib/channels";
import {
  CHANNEL_REQUIRED_MESSAGE,
  descriptionLength,
  EMPTY_EVENT_FORM,
  type EventCommitments,
  type EventDraft,
  type EventEditRules,
  type EventFieldErrors,
  type EventFormState,
  type EventFormValues,
  isInThePast,
  lisbonInstant,
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
  PAST_START_MESSAGE,
  timeChangeConsequences,
  todayInLisbon,
  validateEventForm,
} from "@/lib/event-rules";
import { formatNumber } from "@/lib/format";

const NO_ERRORS: EventFieldErrors = {};

/** A partir de quantos caracteres livres é que o contador aparece. */
const DESCRIPTION_COUNTER_FROM = 200;

const DESCRIPTION_PLACEHOLDER =
  "Quem se enfrenta, o formato, o que está em jogo. Duas ou três linhas chegam.";

/*
 * Um campo fechado é `readOnly`, NÃO `disabled` — e isto não é cosmético.
 *
 * Um `disabled` não é submetido: a chave nem sequer chega ao FormData, e do lado
 * do servidor o preço vinha vazio e falhava o schema (que exige um número) ANTES
 * de a regra de "preço fechado" sequer correr. O `readOnly` submete o valor
 * gravado, o schema passa, e a guarda confirma que ninguém lhe mexeu.
 *
 * Bónus de acessibilidade: um `readOnly` é anunciado como "só de leitura" pelo
 * leitor de ecrã, enquanto um `disabled` é saltado — e um campo que se lê mas
 * não se salta é exactamente o que isto é.
 */
const LOCKED_INPUT =
  "read-only:cursor-not-allowed read-only:bg-muted read-only:text-muted-foreground";

/**
 * Criar **ou editar** um evento.
 *
 * É o mesmo formulário para os dois, e isso não é economia de linhas: são as
 * mesmas regras (lib/event-rules.ts), os mesmos campos e as mesmas três defesas
 * abaixo. Duas cópias divergiam — e a que divergisse seria a que ninguém estava
 * a olhar. (Mesma escolha do `ChannelForm`, em components/admin.)
 *
 * Três coisas que este formulário tem de garantir, porque já falharam:
 *
 *  - **Nada do que foi escrito se perde.** Os campos são controlados, por isso
 *    um erro de validação não lhes toca. (O React 19 faz reset ao form depois
 *    de correr uma action — era isso que limpava tudo, e foi assim que
 *    nasceram 16 eventos duplicados em produção.)
 *  - **Um clique, um evento.** O botão desativa mal o pedido arranca e só volta
 *    a si se houver erro; enquanto navega, fica desativado. O servidor tem a sua
 *    própria guarda de duplicados — ver server/events.ts.
 *  - **Não se marca um evento para trás.** Avisa mal a hora escolhida já tenha
 *    passado, e o servidor volta a verificar antes de gravar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  O CANAL: pergunta-se quando há escolha, diz-se quando não há
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Em CRIAÇÃO, `channels` são os canais onde quem está a criar pode mesmo criar —
 * vem de `listCreatableChannels`, a mesma função que o servidor consulta para
 * aceitar ou recusar. Com **um**, não há decisão nenhuma a tomar: o canal entra
 * preenchido e aparece como contexto, porque transformar um caso único numa
 * pergunta é fazer toda a gente pagar o preço do caso raro. Com **vários**,
 * aparece o seletor — e sem valor por omissão, de propósito: pré-escolher uma
 * liga é a forma mais barata de criar o evento (e o dinheiro dele) na errada.
 *
 * Em EDIÇÃO não há seletor nenhum: um evento não muda de canal (porquê, em
 * lib/event-rules.ts). O canal aparece como contexto e mais nada.
 *
 * O seletor não é a segurança: o slug é revalidado no servidor a cada pedido.
 */

/** O que a action de gravar recebe e devolve — a mesma dos dois lados. */
type EventFormAction = (state: EventFormState, data: FormData) => Promise<EventFormState>;

export type EventFormEditing = {
  /** O evento como está gravado: o "antes" com que se compara o que mudou. */
  current: EventDraft;
  /** Os mesmos valores, já em texto de formulário. */
  values: EventFormValues;
  /** O que está fechado e porquê — ver `eventEditRules`. */
  rules: EventEditRules;
  /** O que o evento já tem vendido, para o ecrã dizer as consequências. */
  commitments: EventCommitments;
};

export type EventFormProps = { action: EventFormAction } & (
  | { mode: "create"; channels: Channel[] }
  | { mode: "edit"; channel: Channel | null; editing: EventFormEditing }
);

/**
 * Porque é que este campo está fechado.
 *
 * O campo desativado por si só diz "não mexas"; não diz "porquê", e sem o porquê
 * a única leitura possível é "isto está avariado". A razão fica sempre à vista,
 * nunca só num tooltip.
 *
 * O cadeado é redundante de propósito — quem não distingue o cinzento do campo
 * desativado tem na mesma um sinal que não depende de cor.
 */
function LockedNote({ id, reason }: { id: string; reason: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Lock aria-hidden className="mt-px size-3 shrink-0" />
      <span>{reason}</span>
    </p>
  );
}

export function EventForm(props: EventFormProps) {
  const { action, mode } = props;
  const editing = mode === "edit" ? props.editing : undefined;
  const rules = editing?.rules;

  const [state, submit, isSubmitting] = useActionState(action, {
    ...EMPTY_EVENT_FORM,
    ...(editing ? { values: editing.values } : {}),
  });

  // Criação com um canal só → não há nada a perguntar. Vários → há uma escolha.
  const channels = mode === "create" ? props.channels : [];
  const onlyChannel = mode === "edit" ? props.channel : (channels[0] ?? null);
  const mustChoose = mode === "create" && channels.length > 1;

  // Valores do servidor à cabeça: sem JS, é assim que a submissão anterior
  // volta preenchida. Com JS, quem manda a partir daqui é o que se escreve.
  const [values, setValues] = useState<EventFormValues>(() => ({
    ...state.values,
    canal: mode === "create" && channels.length === 1 ? channels[0].slug : state.values.canal,
  }));
  // `null` = o último veredito veio do servidor.
  const [clientErrors, setClientErrors] = useState<EventFieldErrors | null>(null);
  // Campos mexidos desde o último veredito: a queixa sobre eles cala-se até
  // haver nova submissão — ninguém quer ler "escolhe a data" com a data posta.
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  // Só depois de montar: o "hoje" do servidor e o do browser podiam não bater
  // certo à meia-noite, e um atributo diferente na hidratação é um erro.
  const [minDate, setMinDate] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const form = useRef<HTMLFormElement>(null);
  /*
   * Que as consequências já foram lidas e aceites. É um ref e não estado porque
   * é lido dentro do `onSubmit` seguinte, no mesmo tique — um `useState` só
   * estaria atualizado no render a seguir, e o diálogo reabria em cima de si.
   */
  const confirmed = useRef(false);
  const lockIds = useId();

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
  const timeMoved = chosen !== null && chosen.getTime() !== editing?.current.startsAt.getTime();
  /*
   * Em edição, "já passou" só se aplica se a hora tiver MUDADO: um rascunho cuja
   * data ficou para trás tem de continuar a poder corrigir o título. É a mesma
   * regra que o servidor aplica — ver `validateEventForm`.
   */
  const alreadyPast = chosen !== null && (!editing || timeMoved) && isInThePast(chosen);

  /*
   * Quanto falta para o limite — contado com as MESMAS funções que o servidor
   * usa para recusar, e sobre o texto já normalizado. Contar o texto em bruto
   * dava um campo a dizer "faltam 0" com espaço de sobra depois de o servidor o
   * limpar, e a recusa aparecia num sítio onde o contador dizia que cabia.
   */
  const descriptionLeft =
    MAX_DESCRIPTION_LENGTH - descriptionLength(normalizeDescription(values.description));

  const verdict = isSubmitting ? NO_ERRORS : (clientErrors ?? state.errors);
  const errors: EventFieldErrors = Object.fromEntries(
    Object.entries(verdict).filter(([field]) => !edited.has(field)),
  );
  const formError = isSubmitting || clientErrors ? "" : state.message;
  const startsAtError = errors.startsAt ?? (alreadyPast ? PAST_START_MESSAGE : undefined);

  // O que muda para quem já comprou. Vazio quando não há nada a avisar — e é
  // isso que decide se o diálogo aparece de todo.
  const consequences =
    editing && timeMoved ? timeChangeConsequences(editing.commitments) : ([] as string[]);

  return (
    <>
      <form
        ref={form}
        action={submit}
        onSubmit={(event) => {
          // A mesma validação que o servidor corre a seguir — esta é só para
          // responder na hora e poupar a ida ao servidor.
          setEdited(new Set());
          const checked = validateEventForm(values, {
            editing: editing ? { current: editing.current, rules: editing.rules } : undefined,
          });
          // O canal fica de fora do `validateEventForm` porque não é um campo de
          // dados: é uma pergunta de permissão, e a resposta é do servidor (ver
          // lib/event-rules.ts). Aqui só se apanha o esquecimento, com a mesma
          // frase que ele devolveria.
          const missingChannel = mustChoose && !values.canal;

          if (!checked.ok || missingChannel) {
            event.preventDefault();
            setClientErrors({
              ...(checked.ok ? {} : checked.errors),
              ...(missingChannel ? { canal: CHANNEL_REQUIRED_MESSAGE } : {}),
            });
            return;
          }

          // Válido, mas há gente que pagou para a hora antiga: primeiro leem-se
          // as consequências, e só depois é que isto grava.
          if (consequences.length > 0 && !confirmed.current) {
            event.preventDefault();
            setClientErrors(null);
            setConfirming(true);
            return;
          }

          confirmed.current = false;
          setClientErrors(null);
        }}
        className="grid items-start gap-5 lg:grid-cols-[1fr_380px]"
        noValidate
      >
        <Card>
          <CardHeader>
            <CardTitle>Detalhes do evento</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {onlyChannel ? (
              /*
               * Um canal só (ou uma edição): isto é contexto, não um campo. De
               * propósito sem `<label>` nem borda de input — um campo desativado
               * que ninguém pode mexer lê-se como avariado, e a pergunta aqui
               * nem existe.
               */
              <div className="flex items-center gap-2.5 rounded-sm bg-muted px-3 py-2.5">
                {mode === "create" ? (
                  <input type="hidden" name="canal" value={values.canal} />
                ) : null}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-xs bg-background font-mono text-2xs text-muted-foreground">
                  {onlyChannel.initials}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-2sm font-semibold">{onlyChannel.name}</span>
                  <span className="font-mono text-2xs text-muted-foreground">
                    canal deste evento
                  </span>
                </span>
              </div>
            ) : null}
            {mustChoose ? (
              <Field>
                <FieldLabel htmlFor="event-canal">Canal</FieldLabel>
                <Select
                  id="event-canal"
                  name="canal"
                  value={values.canal}
                  onChange={(e) => set("canal", e.target.value)}
                  aria-invalid={errors.canal ? true : undefined}
                  // Sem escolha feita, o texto é um convite e não um valor.
                  className={values.canal ? undefined : "text-muted-foreground/70"}
                >
                  <option value="">Escolhe o canal…</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.slug}>
                      {channel.name}
                    </option>
                  ))}
                </Select>
                <FieldError>{errors.canal}</FieldError>
                <FieldHint>O evento e o dinheiro dele ficam neste canal.</FieldHint>
              </Field>
            ) : null}
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
                    className={`font-mono ${LOCKED_INPUT}`}
                    readOnly={Boolean(rules?.startsAt)}
                    aria-describedby={rules?.startsAt ? `${lockIds}-quando` : undefined}
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
                    className={`font-mono ${LOCKED_INPUT}`}
                    readOnly={Boolean(rules?.startsAt)}
                    aria-describedby={rules?.startsAt ? `${lockIds}-quando` : undefined}
                    aria-invalid={errors.time || startsAtError ? true : undefined}
                  />
                  <FieldError>{errors.time}</FieldError>
                </Field>
              </div>
              <FieldError>{startsAtError}</FieldError>
              {rules?.startsAt ? (
                <LockedNote id={`${lockIds}-quando`} reason={rules.startsAt} />
              ) : (
                <FieldHint>Hora de Lisboa.</FieldHint>
              )}
            </div>
            <Field>
              <FieldLabel htmlFor="event-description">Descrição</FieldLabel>
              <Textarea
                id="event-description"
                name="description"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder={DESCRIPTION_PLACEHOLDER}
                rows={5}
                /*
                 * Conforto, não garantia: o browser trava aqui, e quem falar com
                 * a server action à mão passa ao lado. Quem recusa a sério é o
                 * `validateEventForm` no servidor. O valor é generoso de
                 * propósito — o limite conta o texto NORMALIZADO, que é sempre
                 * ≤ ao que se escreveu, e um `maxLength` justo cortava a meio de
                 * uma colagem com `\r\n` que ainda ia encolher.
                 */
                maxLength={MAX_DESCRIPTION_LENGTH * 2}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={`${lockIds}-descricao`}
              />
              <FieldError>{errors.description}</FieldError>
              {/*
               * O contador só aparece perto do fim. Um "0 / 2000" permanente é
               * ruído em cima de um campo que quase ninguém enche, e transforma
               * uma caixa de texto livre num exercício de contagem.
               */}
              <FieldHint id={`${lockIds}-descricao`}>
                {descriptionLeft < 0
                  ? // Passar do limite é possível (o `maxLength` é folgado de
                    // propósito), e aí o número tem de dizer quanto é preciso
                    // CORTAR — "faltam -50 caracteres" não é uma frase.
                    `${formatNumber(-descriptionLeft)} caracteres a mais.`
                  : descriptionLeft <= DESCRIPTION_COUNTER_FROM
                    ? `Faltam ${formatNumber(descriptionLeft)} caracteres.`
                    : "Aparece na página do evento e no texto de partilha. Opcional."}
              </FieldHint>
            </Field>
            {/* TODO(frente-d/roadmap): local e cartaz precisam de colunas novas
                em events — ficam para quando o schema as tiver. */}
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
                    className={`rounded-r-none text-right font-mono ${LOCKED_INPUT}`}
                    readOnly={Boolean(rules?.price)}
                    aria-describedby={rules?.price ? `${lockIds}-preco` : undefined}
                    aria-invalid={errors.price ? true : undefined}
                  />
                  <span className="flex items-center rounded-r-sm border border-l-0 border-input bg-muted px-3.5 font-mono text-sm text-muted-foreground">
                    €
                  </span>
                </div>
                <FieldError>{errors.price}</FieldError>
                {rules?.price ? (
                  <LockedNote id={`${lockIds}-preco`} reason={rules.price} />
                ) : (
                  <FieldHint>Uma compra dá acesso à live deste evento.</FieldHint>
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bilhetes à porta</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="event-ticket-price">Preço do bilhete</FieldLabel>
                <div className="flex">
                  <Input
                    id="event-ticket-price"
                    name="ticketPrice"
                    inputMode="decimal"
                    value={values.ticketPrice}
                    onChange={(e) => set("ticketPrice", e.target.value)}
                    placeholder="—"
                    className="rounded-r-none text-right font-mono"
                    aria-describedby={rules?.ticketsOff ? `${lockIds}-bilhetes` : undefined}
                    aria-invalid={errors.ticketPrice ? true : undefined}
                  />
                  <span className="flex items-center rounded-r-sm border border-l-0 border-input bg-muted px-3.5 font-mono text-sm text-muted-foreground">
                    €
                  </span>
                </div>
                <FieldError>{errors.ticketPrice}</FieldError>
                {rules?.ticketsOff ? (
                  <LockedNote id={`${lockIds}-bilhetes`} reason={rules.ticketsOff} />
                ) : (
                  /*
                   * Em branco é um valor, não um esquecimento — é o que diz que
                   * este evento é só online. Sem esta frase, o campo vazio lia-se
                   * como um formulário por acabar.
                   */
                  <FieldHint>Em branco, este evento não vende bilhetes à porta.</FieldHint>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="event-ticket-capacity">Lotação</FieldLabel>
                <Input
                  id="event-ticket-capacity"
                  name="ticketCapacity"
                  inputMode="numeric"
                  value={values.ticketCapacity}
                  onChange={(e) => set("ticketCapacity", e.target.value)}
                  placeholder="—"
                  className="text-right font-mono"
                  aria-invalid={errors.ticketCapacity ? true : undefined}
                />
                <FieldError>{errors.ticketCapacity}</FieldError>
                <FieldHint>
                  {rules && rules.minCapacity > 0
                    ? `Já vendidos: ${rules.minCapacity}. Em branco, vende sem teto.`
                    : "Em branco, vende sem teto."}
                </FieldHint>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 pt-4">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {editing
                  ? isSubmitting
                    ? "A guardar…"
                    : "Guardar alterações"
                  : isSubmitting
                    ? "A criar evento…"
                    : "Criar evento"}
              </Button>
              <FieldHint>
                {editing
                  ? "O estado da transmissão muda-se na página de transmissão, não aqui."
                  : "Fica como rascunho. As credenciais OBS e o botão de pôr no ar estão na página de transmissão."}
              </FieldHint>
              <FieldError>{formError}</FieldError>
              {/*
               * A sessão caiu com o formulário cheio. A frase sozinha era um
               * beco: isto é o sítio onde carregar sem perder o que está escrito.
               */}
              {state.signInHref && !isSubmitting ? (
                <a
                  href={state.signInHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-2sm font-semibold text-foreground underline underline-offset-4"
                >
                  Entrar noutro separador
                </a>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </form>

      {/*
       * O diálogo diz o que vai ACONTECER a quem já pagou, antes de acontecer.
       * Não pede "tens a certeza?" — pergunta sem informação nenhuma —, mostra
       * as consequências que o servidor não tem como desfazer depois.
       */}
      <ConfirmDialog
        open={confirming}
        title="Mudar a hora de um evento já vendido"
        confirmLabel="Mudar a hora"
        pendingLabel="A guardar…"
        pending={isSubmitting}
        onConfirm={() => {
          confirmed.current = true;
          setConfirming(false);
          form.current?.requestSubmit();
        }}
        onDismiss={() => setConfirming(false)}
      >
        {consequences.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </ConfirmDialog>
    </>
  );
}
