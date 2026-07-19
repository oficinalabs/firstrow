"use client";

import { useRouter } from "next/navigation";
import { createChannelAction, updateChannelAction } from "@/app/admin/canais/actions";
import { ChannelForm, type ChannelSubmitResult } from "@/components/admin/channel-form";
import type { ChannelDraft, ChannelFormValues } from "@/components/admin/channel-rules";
import type { Channel } from "@/lib/channels";

/*
 * A ligação entre o formulário da Frente F e as server actions.
 *
 * O `ChannelForm` não sabe gravar de propósito — recebe valores e um
 * `onSubmit`. Este ficheiro é esse `onSubmit`, e é só isso: nem valida (o
 * formulário já o faz à ida e o servidor à chegada), nem redige mensagens (vêm
 * da action). Existir separado é o que deixa o mesmo formulário servir criar e
 * editar sem um `if` lá dentro.
 *
 * PARA ONDE SE VAI DEPOIS DE GRAVAR, e porquê:
 *
 *  - a criar → para os MEMBROS do canal novo. Um canal acabado de nascer não
 *    tem dono nenhum (ver `createChannelAction`), e o passo que falta é entregá-lo
 *    à liga. Deixar a pessoa na lista escondia isso atrás de mais um clique.
 *  - a editar → para a LISTA, onde a mudança se vê. É a confirmação honesta de
 *    que gravou: o nome e a cor novos estão lá, em vez de um aviso a dizê-lo.
 *
 * Em qualquer dos casos o `onSubmit` acaba sem devolver nada, que é o contrato
 * do formulário para "correu bem": o botão fica desativado enquanto se navega,
 * e não há como carregar duas vezes.
 */

/** Um canal da base de dados nos campos de texto que o formulário conhece. */
function toFormValues(channel: Channel): ChannelFormValues {
  return {
    name: channel.name,
    slug: channel.slug,
    tagline: channel.tagline,
    // O formulário trabalha em texto; NULL na base de dados é campo vazio aqui.
    logoUrl: channel.logoUrl ?? "",
    bannerUrl: channel.bannerUrl ?? "",
    accentColor: channel.accentColor,
    accentColorSecondary: channel.accentColorSecondary ?? "",
  };
}

export type ChannelEditorProps = {
  /** Sem canal, é criação. Com canal, é edição — e o id nunca vem do cliente. */
  channel?: Channel;
};

export function ChannelEditor({ channel }: ChannelEditorProps) {
  const router = useRouter();

  async function submit(draft: ChannelDraft): Promise<ChannelSubmitResult> {
    const result = channel
      ? await updateChannelAction(channel.id, draft)
      : await createChannelAction(draft);

    if (!result.ok) return { message: result.message, errors: result.errors };

    router.push(channel ? "/admin/canais" : `/admin/canais/${result.channelId}/membros`);
  }

  return (
    <ChannelForm
      initialValues={channel ? toFormValues(channel) : undefined}
      onSubmit={submit}
      mode={channel ? "edit" : "create"}
    />
  );
}
