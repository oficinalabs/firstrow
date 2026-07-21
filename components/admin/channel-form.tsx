"use client";

import { useState } from "react";
import { BrandColorPicker } from "@/components/admin/brand-color-picker";
import { ChannelPreview } from "@/components/admin/channel-preview";
import {
  type ChannelDraft,
  type ChannelFieldErrors,
  type ChannelFormValues,
  EMPTY_CHANNEL_VALUES,
  previewChannel,
  slugify,
  validateChannelForm,
} from "@/components/admin/channel-rules";
import { ImageUpload } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { channelPath } from "@/lib/channels";

/*
 * Criar ou editar um canal.
 *
 * Não sabe gravar: recebe os valores iniciais e um `onSubmit` por props. Quem o
 * usa é que decide o que fazer com o canal validado — assim o mesmo formulário
 * serve para criar e para editar, e os testes não precisam de base de dados.
 *
 * Três garantias que este projeto já pagou para aprender (ver event-form.tsx —
 * foi de um formulário sem elas que nasceram 16 eventos duplicados):
 *
 *  - **Nada do que foi escrito se perde.** Campos controlados e estado que nunca
 *    é reposto a partir da resposta do servidor: um erro de validação encontra o
 *    formulário exactamente como estava.
 *  - **A queixa cala-se quando se mexe no campo.** Ninguém quer ler "dá um nome
 *    ao canal" com o nome já escrito. O erro volta na submissão seguinte.
 *  - **Um clique, um canal.** O botão desativa mal o pedido arranca e só volta a
 *    si se houver erro — enquanto navega para a página nova, fica desativado.
 */

/** O que o servidor tem a dizer quando recusa gravar. */
export type ChannelSubmitProblem = {
  /** Erro que não é de nenhum campo: sem permissões, servidor em baixo. */
  message?: string;
  /** Erros por campo — o endereço já estar ocupado, tipicamente. */
  errors?: ChannelFieldErrors;
};

/**
 * O que o `onSubmit` devolve: um problema, ou nada quando correu bem.
 *
 * `void` e não `undefined`: o handler mais natural — gravar e navegar, sem
 * devolver nada — é `async () => { … }`, e um `Promise<void>` não encaixa num
 * `Promise<… | undefined>`. Com `undefined`, quem chama tinha de acabar todos os
 * handlers com um `return undefined` só para o TypeScript ficar quieto.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: é o que deixa `async () => {}` encaixar — ver acima
export type ChannelSubmitResult = ChannelSubmitProblem | void;

export type ChannelFormProps = {
  /** Em edição, os valores do canal; em criação, fica tudo por preencher. */
  initialValues?: Partial<ChannelFormValues>;
  /** Chamado só com um canal já validado. Devolver erro reabre o formulário. */
  onSubmit: (draft: ChannelDraft) => Promise<ChannelSubmitResult>;
  mode?: "create" | "edit";
  /**
   * O canal em edição. Vai para o upload de imagens, que precisa de saber a
   * que canal pertence o que se está a carregar — em criação não há nenhum, e
   * a rota trata disso (só a FirstRow cria canais).
   */
  channelId?: string;
};

const NO_ERRORS: ChannelFieldErrors = {};

export function ChannelForm({
  initialValues,
  onSubmit,
  mode = "create",
  channelId,
}: ChannelFormProps) {
  const [values, setValues] = useState<ChannelFormValues>(() => {
    const merged = { ...EMPTY_CHANNEL_VALUES, ...initialValues };
    // Nome dado sem endereço (criar a partir de um rascunho, por exemplo): o
    // endereço nasce logo do nome. Sem isto o campo ficava vazio à espera de uma
    // tecla que ninguém ia carregar, e a submissão queixava-se de um campo que a
    // pessoa nunca viu por preencher.
    return { ...merged, slug: merged.slug || slugify(merged.name) };
  });
  // `null` = o último veredito veio do servidor.
  const [clientErrors, setClientErrors] = useState<ChannelFieldErrors | null>(null);
  const [serverErrors, setServerErrors] = useState<ChannelFieldErrors>(NO_ERRORS);
  const [formError, setFormError] = useState("");
  // Campos mexidos desde o último veredito: a queixa sobre eles cala-se.
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [isSubmitting, setSubmitting] = useState(false);
  /*
   * O endereço acompanha o nome enquanto ninguém lhe tocar. A partir do momento
   * em que é escrito à mão passa a ser dele — mudar o nome não lho leva à frente.
   * Em edição já nasce "tocado": mexer no slug de um canal publicado parte links.
   */
  const [slugPinned, setSlugPinned] = useState(Boolean(initialValues?.slug));

  function set(field: keyof ChannelFormValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !slugPinned ? { slug: slugify(value) } : {}),
    }));
    setEdited((previous) => {
      if (previous.has(field)) return previous;
      const next = new Set(previous).add(field);
      // Mexer no nome reescreve o endereço: a queixa sobre ele também se cala.
      if (field === "name" && !slugPinned) next.add("slug");
      return next;
    });
  }

  const verdict = isSubmitting ? NO_ERRORS : (clientErrors ?? serverErrors);
  const errors: ChannelFieldErrors = Object.fromEntries(
    Object.entries(verdict).filter(([field, message]) => message && !edited.has(field)),
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Guarda de duplo-clique no próprio handler: o `disabled` é a primeira
    // barreira, esta é a que aguenta um Enter repetido antes do re-render.
    if (isSubmitting) return;

    setEdited(new Set());
    setFormError("");

    // A mesma validação que o servidor volta a correr — esta é só para responder
    // na hora e poupar a viagem.
    const checked = validateChannelForm(values);
    if (!checked.ok) {
      setClientErrors(checked.errors);
      return;
    }
    setClientErrors(null);
    setServerErrors(NO_ERRORS);
    setSubmitting(true);

    try {
      const result = await onSubmit(checked.draft);
      if (result?.errors || result?.message) {
        setServerErrors(result.errors ?? NO_ERRORS);
        setFormError(result.message ?? "");
        setSubmitting(false);
      }
      // Sem erro, o botão fica desativado: quem chamou está a navegar.
    } catch {
      setFormError("Não conseguimos gravar o canal. Tenta outra vez daqui a pouco.");
      setSubmitting(false);
    }
  }

  const preview = previewChannel(values);

  return (
    <form
      onSubmit={handleSubmit}
      className="grid items-start gap-5 lg:grid-cols-[1fr_340px]"
      noValidate
    >
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Identidade</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="channel-name">Nome do canal</FieldLabel>
              <Input
                id="channel-name"
                name="name"
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Liga do Norte"
                aria-invalid={errors.name ? true : undefined}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="channel-slug">Endereço</FieldLabel>
              <Input
                id="channel-slug"
                name="slug"
                value={values.slug}
                onChange={(event) => {
                  setSlugPinned(true);
                  set("slug", event.target.value);
                }}
                placeholder="liga-do-norte"
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                className="font-mono"
                aria-invalid={errors.slug ? true : undefined}
              />
              <FieldError>{errors.slug}</FieldError>
              {/* A dica mostra o endereço que está mesmo no campo — nunca um que
                  a pré-visualização tenha adivinhado, senão prometia uma página
                  que a submissão ia recusar. */}
              {!errors.slug && values.slug.trim() !== "" && (
                <FieldHint>
                  A página do canal fica em{" "}
                  <span className="font-mono">{channelPath(values.slug.trim())}</span>
                  {mode === "edit" ? " — mudá-lo parte os links já partilhados." : "."}
                </FieldHint>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="channel-tagline">Uma linha sobre a liga</FieldLabel>
              <Input
                id="channel-tagline"
                name="tagline"
                value={values.tagline}
                onChange={(event) => set("tagline", event.target.value)}
                placeholder="Batalhas de rap · Porto"
                aria-invalid={errors.tagline ? true : undefined}
              />
              <FieldError>{errors.tagline}</FieldError>
            </Field>
          </CardContent>
        </Card>

        {/*
         * As imagens em cartão próprio, e uma por linha: o banner é uma faixa
         * 3:1 e a pré-visualização dele só diz alguma coisa com largura. Numa
         * coluna a 375px ficariam empilhadas na mesma — nasce responsivo.
         */}
        <Card>
          <CardHeader>
            <CardTitle>Imagens</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ImageUpload
              kind="logo"
              value={values.logoUrl}
              onChange={(url) => set("logoUrl", url)}
              channelId={channelId}
              error={errors.logoUrl}
              disabled={isSubmitting}
            />
            <ImageUpload
              kind="banner"
              value={values.bannerUrl}
              onChange={(url) => set("bannerUrl", url)}
              channelId={channelId}
              error={errors.bannerUrl}
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cores</CardTitle>
          </CardHeader>
          <CardContent>
            <BrandColorPicker
              accentColor={values.accentColor}
              accentColorSecondary={values.accentColorSecondary}
              onAccentChange={(hex) => set("accentColor", hex)}
              onSecondaryChange={(hex) => set("accentColorSecondary", hex)}
              errors={errors}
            />
          </CardContent>
        </Card>
      </div>

      {/* Fica à vista enquanto se escolhe: é para isso que serve. */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        <Card>
          <CardHeader>
            <CardTitle>Como vai ficar</CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelPreview channel={preview} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
              {isSubmitting
                ? mode === "edit"
                  ? "A guardar…"
                  : "A criar canal…"
                : mode === "edit"
                  ? "Guardar alterações"
                  : "Criar canal"}
            </Button>
            <FieldError>{formError}</FieldError>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
