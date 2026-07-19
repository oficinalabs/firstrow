import type { Metadata } from "next";
import Link from "next/link";
import { VerificarAgora } from "@/app/admin/pagamentos/verificar-agora";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatEuro, formatNumber, formatTime } from "@/lib/format";
import { manageScope, requireUser } from "@/server/authz";
import { channelsInScope } from "@/server/channels";
import { listPurchasesAtRisk, type PurchaseAtRisk, type PurchaseRisk } from "@/server/purchases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pagamentos" };

/*
 * ============================================================================
 *  DINHEIRO EM RISCO
 * ============================================================================
 *
 * Aconteceu em sandbox: pagamento confirmado do lado da Eupago, webhook nunca
 * chegou, compra pendente para sempre. Em produção isso é um cliente que pagou
 * 7,50 €, não tem acesso, e escreve à liga — que não tinha onde ir ver.
 *
 * Esta página é esse sítio. A coluna que a justifica é a **referência da
 * Eupago**: é o número que se dita ao suporte deles para perguntar se uma
 * compra foi paga.
 *
 * O âmbito é `manageScope`, como todo o resto do backoffice: um `owner` do
 * canal A não vê o dinheiro nem os emails dos compradores do canal B. A regra
 * está em `server/purchases.ts:listPurchasesAtRisk` e passa pelo `inScope` de
 * `server/authz.ts` — o mesmo sítio único de sempre.
 */

const ESTADOS: Record<
  PurchaseRisk,
  { rotulo: string; variant: "muted" | "warning" | "destructive" }
> = {
  aberta: { rotulo: "A decorrer", variant: "muted" },
  expirada: { rotulo: "Expirada", variant: "warning" },
  "sem-cobranca": { rotulo: "Sem cobrança", variant: "destructive" },
};

// Hoje mostra a hora; dias anteriores mostram a data. Igual ao dashboard.
function quando(instante: Date): string {
  return formatDate(instante) === formatDate(new Date())
    ? formatTime(instante)
    : formatDate(instante);
}

export default async function PaymentsPage() {
  const user = await requireUser({ next: "/admin/pagamentos" });
  const scope = manageScope(user);
  const [compras, channels] = await Promise.all([
    listPurchasesAtRisk(scope),
    channelsInScope(scope),
  ]);

  const porResolver = compras.filter((c) => c.risco === "expirada");
  const aDecorrer = compras.filter((c) => c.risco === "aberta");
  const semCobranca = compras.filter((c) => c.risco === "sem-cobranca");
  const emRiscoCents = porResolver.reduce((total, c) => total + c.amountCents, 0);

  // A verificação mais recente de TODAS as linhas — é o que diz à liga que o
  // sistema anda mesmo a perguntar, e não só a listar.
  const ultima = compras
    .map((c) => c.reconciledAt)
    .filter((data): data is Date => data != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title="Pagamentos"
        meta={
          ultima ? `última verificação às ${formatTime(ultima)}` : "verificado de 5 em 5 minutos"
        }
        action={<VerificarAgora />}
      />

      {compras.length > 0 ? (
        <>
          <div className="grid gap-3.5 md:grid-cols-3">
            <StatCard
              label="Por resolver"
              value={formatEuro(emRiscoCents)}
              hint={`${formatNumber(porResolver.length)} com a janela MB WAY fechada`}
              hintTone={porResolver.length > 0 ? "destructive" : "muted"}
            />
            <StatCard
              label="A decorrer"
              value={formatNumber(aDecorrer.length)}
              hint="ainda a confirmar na app MB WAY"
            />
            <StatCard
              label="Sem cobrança"
              value={formatNumber(semCobranca.length)}
              hint="o pedido nunca chegou à Eupago"
              hintTone={semCobranca.length > 0 ? "destructive" : "muted"}
            />
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 pt-4">
              <DataTable<PurchaseAtRisk>
                columns={[
                  {
                    header: "Quando",
                    cell: (c) => (
                      <span className="font-mono text-xs text-muted-foreground">
                        {quando(c.createdAt)}
                      </span>
                    ),
                  },
                  {
                    header: "Comprador",
                    cell: (c) => (
                      <span className="flex flex-col">
                        <span className="font-semibold">{c.buyerName}</span>
                        <span className="font-mono text-2xs text-muted-foreground">
                          {c.buyerEmail}
                        </span>
                      </span>
                    ),
                  },
                  {
                    header: "Tipo",
                    cell: (c) => (
                      <span className="text-muted-foreground">
                        {c.kind === "ticket" ? "Bilhete" : "Acesso à live"}
                      </span>
                    ),
                  },
                  {
                    header: "Evento",
                    cell: (c) => <span className="text-muted-foreground">{c.eventTitle}</span>,
                  },
                  // De que liga é este dinheiro. Com uma só, era palha.
                  ...(channels.many
                    ? [
                        {
                          header: "Canal",
                          cell: (c: PurchaseAtRisk) => (
                            <span className="text-xs text-muted-foreground">
                              {channels.byId.get(c.channelId)?.name ?? "—"}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  {
                    header: "Ref. Eupago",
                    cell: (c) =>
                      c.providerRef ? (
                        <span className="font-mono text-xs font-medium">{c.providerRef}</span>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">—</span>
                      ),
                  },
                  {
                    header: "Estado",
                    cell: (c) => (
                      <Badge variant={ESTADOS[c.risco].variant}>{ESTADOS[c.risco].rotulo}</Badge>
                    ),
                  },
                  { header: "Valor", numeric: true, cell: (c) => formatEuro(c.amountCents) },
                ]}
                rows={compras}
                rowKey={(c) => c.id}
              />
              <p className="border-t-2 border-accent pt-2.5 font-mono text-2xs leading-relaxed text-muted-foreground">
                O sistema pergunta sozinho à Eupago se estas compras já foram pagas, e fecha as que
                foram. Uma que fique <strong>expirada</strong> com referência quer dizer que a
                Eupago diz que não foi paga — se o cliente garantir que pagou, é essa referência que
                se dita ao suporte deles.
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState
          className="mt-4"
          title="Nada por fechar"
          description="Aparecem aqui as compras que ficaram a meio — a decorrer, expiradas ou sem cobrança — com a referência da Eupago ao lado para poderes perguntar."
          action={
            <Link href="/admin/eventos" className={buttonVariants({ variant: "secondary" })}>
              Ver eventos
            </Link>
          }
        />
      )}
    </div>
  );
}
