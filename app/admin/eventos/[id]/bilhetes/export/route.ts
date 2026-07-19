import { NextResponse } from "next/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { canManageEvents, getCurrentUser } from "@/server/authz";
import { getEvent } from "@/server/events";
import { listTicketsByEvent, shortCode } from "@/server/tickets";

const ESTADO_PT: Record<string, string> = {
  issued: "por usar",
  used: "entrou",
  refunded: "reembolsado",
};

// BOM UTF-8 — sem ele o Excel abre acentos desfeitos.
const BOM = "\uFEFF";

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// O CSV leva nomes e emails de quem comprou — é para quem gere a liga, não
// para quem só está a operar a porta.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sem sessão" }, { status: 401 });
  if (!canManageEvents(user)) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  const bilhetes = await listTicketsByEvent(id);
  const lines = [
    ["codigo", "nome", "email", "comprado", "estado", "usado_as"].join(","),
    ...bilhetes.map((t) =>
      [
        csvField(t.qrToken ? shortCode(t.qrToken) : ""),
        csvField(t.nome),
        csvField(t.email),
        csvField(formatDate(t.createdAt)),
        csvField(ESTADO_PT[t.status] ?? t.status),
        csvField(t.usedAt ? formatDateTime(t.usedAt) : ""),
      ].join(","),
    ),
  ];

  return new NextResponse(`${BOM}${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bilhetes-${id}.csv"`,
    },
  });
}
