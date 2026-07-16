import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-helper";
import { hasActiveEntitlement } from "@/server/entitlements";

// Usado pelo botão de compra para fazer polling até o pagamento confirmar.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await requireUser();
  if (!user) return NextResponse.json({ active: false });
  return NextResponse.json({ active: await hasActiveEntitlement(user.id, eventId) });
}
