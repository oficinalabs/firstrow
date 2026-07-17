import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/server/auth-helper";
import { validateTicket } from "@/server/tickets";

const bodySchema = z.object({
  code: z.string().trim().min(4),
  eventId: z.string().min(1),
});

// Validação à porta (scanner) — só admins.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Código em falta" }, { status: 400 });
  }

  const result = await validateTicket(parsed.data.code, parsed.data.eventId);
  return NextResponse.json(result);
}
