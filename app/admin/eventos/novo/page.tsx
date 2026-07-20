import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createEventAction } from "@/app/admin/eventos/actions";
import { EventForm } from "@/components/admin/event-form";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { canManageAnyChannel, requireUser } from "@/server/authz";
import { listCreatableChannels } from "@/server/event-access";

export const metadata: Metadata = { title: "Criar evento" };

export default async function NewEventPage() {
  /*
   * Criar um evento provisiona um live input na Cloudflare, e isso custa
   * dinheiro — só quem é dono de algum canal chega aqui.
   *
   * Ao contrário dos outros ecrãs de evento, este não tem um evento de onde
   * tirar o canal (é o que vai nascer). O gate possível é o genérico; EM QUE
   * canal nasce decide-se na action, em `resolveChannelForNewEvent`.
   */
  const user = await requireUser({ next: "/admin/eventos/novo" });
  // `canManageAnyChannel` e não `canEnterBackoffice`: desde que o staff entra no
  // backoffice, "estar cá dentro" deixou de querer dizer "gere um canal". Criar
  // eventos custa dinheiro (provisiona vídeo), logo continua a pedir `owner`.
  if (!canManageAnyChannel(user)) notFound();

  /*
   * Os canais onde esta pessoa pode mesmo criar. O formulário usa-os para
   * decidir se pergunta ou se apenas mostra, e é a MESMA lista que o servidor
   * consulta ao gravar — por construção, o seletor nunca oferece um canal que
   * a gravação vá recusar.
   */
  const { list: channels } = await listCreatableChannels(user);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Criar evento" backHref="/admin/eventos" backLabel="Eventos" />
      {channels.length === 0 ? (
        /*
         * Um `platform_admin` numa plataforma ainda sem canais. Um `owner` não
         * cai aqui — ser dono de um canal é o que lhe abre esta porta. Mostrar
         * o formulário seria deixá-lo escrever tudo para levar com uma recusa
         * no fim, por uma razão que não é dele.
         *
         * O caminho de saída é `/admin/canais`, o ecrã da Frente G: daqui só se
         * aponta para lá, não se cria canal nenhum.
         */
        <EmptyState
          className="mt-4"
          title="Ainda não há canais"
          description="Um evento pertence sempre a um canal — é dele a marca da página, o dinheiro das vendas e quem o pode gerir. Cria primeiro o canal e o evento nasce lá dentro."
          action={
            <Link href="/admin/canais" className={buttonVariants({ size: "lg" })}>
              Criar canal
            </Link>
          }
        />
      ) : (
        <EventForm mode="create" action={createEventAction} channels={channels} />
      )}
    </div>
  );
}
