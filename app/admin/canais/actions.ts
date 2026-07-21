"use server";

import { revalidatePath } from "next/cache";
import type { ChannelDraft } from "@/components/admin/channel-rules";
import { type ChannelFieldErrors, validateChannelForm } from "@/components/admin/channel-rules";
import { CHANNEL_ROLES, type ChannelRole } from "@/db/schema";
import { channelPath } from "@/lib/channels";
import { deleteImageByUrl, isOwnPublicUrl } from "@/lib/r2";
import { permitChannelCreation, permitChannelManagement } from "@/server/channel-access";
import {
  memberChangeMessage,
  removeChannelMember,
  setChannelMemberByEmail,
} from "@/server/channel-members";
import { type ChannelSaved, createChannel, updateChannel } from "@/server/channels";

/*
 * Ações de canais do backoffice.
 *
 * Uma server action é um endpoint como qualquer outro: os papéis e os dados
 * validam-se AQUI, sempre. O formulário do outro lado é conveniência, não
 * segurança — nada do que ele manda chega à base de dados sem voltar a passar
 * por `validateChannelForm`, a mesma função que ele correu no browser.
 *
 * Quem pode o quê está em `server/channel-access.ts`, e não espalhado por estas
 * funções: aqui só se pergunta e se traduz a resposta em mensagem.
 */

/** O que uma escrita de canal devolve ao formulário da Frente F. */
export type ChannelActionResult =
  | { ok: true; channelId: string }
  | { ok: false; message?: string; errors?: ChannelFieldErrors };

const SLUG_TAKEN: ChannelFieldErrors = {
  slug: "Este endereço já é de outro canal — escolhe outro.",
};

const CHANNEL_GONE = "Este canal já não existe — recarrega a página.";

function refreshChannelScreens(slugs: readonly string[]) {
  revalidatePath("/admin/canais");
  // A sidebar do backoffice mostra o nome e a cor do canal de quem o gere.
  revalidatePath("/admin", "layout");
  // A visão geral lista os canais todos.
  revalidatePath("/");
  // Endereço mudado: a página velha deixa de existir e a nova passa a existir,
  // por isso as duas precisam de ser refrescadas — não só a que ficou.
  for (const slug of new Set(slugs)) revalidatePath(channelPath(slug));
}

/*
 * ============================================================================
 *  AS IMAGENS TÊM DE SER NOSSAS
 * ============================================================================
 *
 * `validateChannelForm` responde "consegue-se servir?" — é uma pergunta pura,
 * corre no browser, e não sabe (nem pode saber) qual é o bucket. A segunda
 * pergunta é a que interessa à segurança e só tem resposta deste lado:
 * **este URL saiu do nosso upload?**
 *
 * Sem isto, um pedido feito à mão — sem passar pelo formulário — gravava
 * `https://qualquer-sitio.pt/x.png` na coluna `logo_url`. O `next/image` não o
 * servia (não está em `remotePatterns`), e o resultado era a página do canal a
 * rebentar no render. Uma liga ficava sem página por causa de um POST.
 *
 * Um caminho interno ("/brand/…") continua a passar: são as imagens que vieram
 * no repositório, servidas por nós, e recusá-las agora apagava logos que já
 * estão em produção.
 */
const FOREIGN_IMAGE = "Esta imagem não é nossa — carrega-a outra vez pelo botão.";

const IMAGE_FIELDS = ["logoUrl", "bannerUrl"] as const;

function foreignImages(draft: ChannelDraft): ChannelFieldErrors | null {
  const errors: ChannelFieldErrors = {};
  for (const field of IMAGE_FIELDS) {
    const value = draft[field];
    // Chegado aqui, o valor é um caminho interno ou um URL https — o schema já
    // recusou tudo o resto. Logo, o que não começa por "/" é absoluto.
    if (value && !value.startsWith("/") && !isOwnPublicUrl(value)) {
      errors[field] = FOREIGN_IMAGE;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Apaga do R2 as imagens que este canal deixou de usar.
 *
 * Corre DEPOIS de a gravação ter corrido bem, e só aí: apagar antes (ou no
 * momento do upload) era arriscar deixar a página do canal a apontar para um
 * objeto que já não existe se a gravação falhasse a seguir — ou se a pessoa
 * fechasse o separador sem guardar.
 *
 * Falhar a limpeza nunca desfaz a gravação. `deleteImageByUrl` só regista no
 * log; o pior caso é um objeto órfão a ocupar uns KB.
 */
type WithImages = Pick<ChannelDraft, "logoUrl" | "bannerUrl">;

async function forgetReplacedImages(before: WithImages, after: WithImages): Promise<void> {
  await Promise.all(
    IMAGE_FIELDS.filter((field) => before[field] && before[field] !== after[field]).map((field) =>
      deleteImageByUrl(before[field]),
    ),
  );
}

/** Traduz a recusa da camada de dados para o campo (ou o alerta) certo. */
function refusal(saved: Extract<ChannelSaved, { ok: false }>): ChannelActionResult {
  return saved.reason === "slug-taken"
    ? { ok: false, errors: SLUG_TAKEN }
    : { ok: false, message: CHANNEL_GONE };
}

/**
 * Cria um canal. Só a FirstRow — ver `permitChannelCreation`.
 *
 * Repare-se no que **não** acontece: o canal nasce sem dono nenhum. É
 * deliberado e é o que a ADR-011 já decidiu para a migração — inventar um dono
 * seria dar acesso a quem não o pediu. Quem acabou de o criar continua a poder
 * geri-lo (passa por cima de tudo), e o ecrã de membros é o passo seguinte do
 * fluxo justamente para a entrega à liga ser explícita.
 */
export async function createChannelAction(input: unknown): Promise<ChannelActionResult> {
  const permit = await permitChannelCreation();
  if (!permit.ok) return { ok: false, message: permit.error };

  const checked = validateChannelForm(input);
  if (!checked.ok) return { ok: false, errors: checked.errors };

  const foreign = foreignImages(checked.draft);
  if (foreign) return { ok: false, errors: foreign };

  let saved: ChannelSaved;
  try {
    // `checked.draft` e nunca o que veio do cliente: é o que garante que as
    // cores chegam normalizadas e as iniciais são derivadas do nome de novo.
    saved = await createChannel(checked.draft);
  } catch (error) {
    console.error("[canais] criar falhou:", error);
    return { ok: false, message: "Não deu para criar o canal. Tenta outra vez daqui a pouco." };
  }
  if (!saved.ok) return refusal(saved);

  refreshChannelScreens([saved.channel.slug]);
  return { ok: true, channelId: saved.channel.id };
}

/** Grava a marca de um canal que já existe. Dono DESTE canal, ou a FirstRow. */
export async function updateChannelAction(
  channelId: unknown,
  input: unknown,
): Promise<ChannelActionResult> {
  if (typeof channelId !== "string" || channelId === "") {
    return { ok: false, message: "Pedido inválido — recarrega a página." };
  }

  // O canal vem do URL, mas quem decide é isto: um canal alheio dá a mesma
  // resposta que um id inventado.
  const permit = await permitChannelManagement(channelId);
  if (!permit.ok) return { ok: false, message: permit.error };

  const checked = validateChannelForm(input);
  if (!checked.ok) return { ok: false, errors: checked.errors };

  const foreign = foreignImages(checked.draft);
  if (foreign) return { ok: false, errors: foreign };

  let saved: ChannelSaved;
  try {
    saved = await updateChannel(channelId, checked.draft);
  } catch (error) {
    console.error("[canais] guardar falhou:", error);
    return { ok: false, message: "Não deu para guardar o canal. Tenta outra vez daqui a pouco." };
  }
  if (!saved.ok) return refusal(saved);

  // `permit.channel` é o canal ANTES desta escrita — é dele que saem as imagens
  // que deixaram de ser usadas. Só depois de a gravação ter corrido bem.
  await forgetReplacedImages(permit.channel, saved.channel);

  // O endereço de antes vai à lista de propósito: se mudou, a página velha tem
  // de deixar de servir o que já não é verdade.
  refreshChannelScreens([permit.channel.slug, saved.channel.slug]);
  return { ok: true, channelId: saved.channel.id };
}

// ── Membros ─────────────────────────────────────────────────────────────────

/** O que as ações de membros devolvem: nada, ou uma frase para mostrar. */
export type MemberActionResult = { error?: string };

function isChannelRole(value: unknown): value is ChannelRole {
  return typeof value === "string" && (CHANNEL_ROLES as readonly string[]).includes(value);
}

function refreshMemberScreens(channelId: string) {
  revalidatePath(`/admin/canais/${channelId}/membros`);
  revalidatePath("/admin/canais");
  // Ganhar ou perder um canal muda a navegação e o âmbito de quem lá entra.
  revalidatePath("/admin", "layout");
}

/**
 * Convida alguém para o canal, ou muda o papel de quem já lá está — é a mesma
 * escrita, e por isso é a mesma função (`setChannelMemberByEmail` faz upsert).
 *
 * As recusas não são redigidas aqui: `memberChangeMessage()` já tem a redação
 * de cada uma, e duas versões do mesmo "não" acabam sempre a divergir.
 */
export async function setMemberAction(
  channelId: unknown,
  email: unknown,
  role: unknown,
): Promise<MemberActionResult> {
  if (typeof channelId !== "string" || channelId === "") {
    return { error: "Pedido inválido — recarrega a página." };
  }
  if (typeof email !== "string" || email.trim() === "") {
    return { error: "Escreve o email da conta que queres juntar ao canal." };
  }
  // Papel desconhecido é recusado em vez de assumido: cair no menos poderoso
  // dava a alguém um acesso que ninguém escolheu dar.
  if (!isChannelRole(role)) return { error: "Papel desconhecido — recarrega a página." };

  const permit = await permitChannelManagement(channelId);
  if (!permit.ok) return { error: permit.error };

  try {
    const result = await setChannelMemberByEmail(channelId, email, role);
    if (!result.ok) return { error: memberChangeMessage(result.reason) };
  } catch (error) {
    console.error("[canais] mudar membro falhou:", error);
    return { error: "Não deu para gravar a mudança. Tenta outra vez daqui a pouco." };
  }

  refreshMemberScreens(channelId);
  return {};
}

/** Retira alguém do canal. Recusado se for o último dono — ver o invariante. */
export async function removeMemberAction(
  channelId: unknown,
  userId: unknown,
): Promise<MemberActionResult> {
  if (typeof channelId !== "string" || channelId === "") {
    return { error: "Pedido inválido — recarrega a página." };
  }
  if (typeof userId !== "string" || userId === "") {
    return { error: "Pedido inválido — recarrega a página." };
  }

  const permit = await permitChannelManagement(channelId);
  if (!permit.ok) return { error: permit.error };

  try {
    const result = await removeChannelMember(channelId, userId);
    if (!result.ok) return { error: memberChangeMessage(result.reason) };
  } catch (error) {
    console.error("[canais] remover membro falhou:", error);
    return { error: "Não deu para retirar a pessoa. Tenta outra vez daqui a pouco." };
  }

  refreshMemberScreens(channelId);
  return {};
}
