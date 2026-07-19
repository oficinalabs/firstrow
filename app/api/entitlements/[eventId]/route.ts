import { NextResponse } from "next/server";
import { requireApi } from "@/server/api-guard";
import { hasActiveEntitlement } from "@/server/entitlements";

// Usado pelo botão de compra para fazer polling até o pagamento confirmar.
// Responde sempre sobre o utilizador da sessão — não aceita `userId` de fora.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const gate = await requireApi();
  if (!gate.ok) return gate.response;

  return NextResponse.json({ active: await hasActiveEntitlement(gate.user.id, eventId) });
}
