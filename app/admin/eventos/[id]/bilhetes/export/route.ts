import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth-helper";
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) {
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
