import type { NextResponse } from "next/server";
import { newId } from "@/lib/ids";

/*
 * ============================================================================
 *  IDENTIDADE DE DISPOSITIVO — o cookie que separa "recarregou" de "partilhou"
 * ============================================================================
 *
 * Um valor aleatório, criado no primeiro play e guardado num cookie httpOnly.
 * É o que permite à regra de uma-reprodução-de-cada-vez saber se a sessão nova
 * vem do mesmo sítio que a anterior. Sem ele, cada recarga da página parecia
 * uma tomada de sessão — e era assim que a régie mostrava 7 bloqueios para uma
 * pessoa sozinha num browser só.
 *
 * O QUE ELE NÃO É: uma credencial. Não abre vídeo nenhum, não prova nada e não
 * substitui a sessão de autenticação. É deliberadamente um identificador burro:
 * quem o forjar consegue, no máximo, aparecer como um dispositivo diferente (e
 * ser contado como bloqueio) ou como o mesmo (e não ser contado). Em nenhum dos
 * casos vê o que não comprou, nem vê em dois sítios ao mesmo tempo — isso é
 * decidido em `canWatchEvent` e no carimbo de `startSession`.
 *
 * httpOnly porque não há uma única razão para o JS da página lhe tocar, e um
 * cookie que o JS não lê é um cookie que um XSS não colhe.
 *
 * RGPD: é um identificador técnico, ligado a uma sessão de reprodução que já
 * exige conta e compra. Não segue ninguém entre sites nem alimenta publicidade.
 */

/** Curto e sem significado à vista — não anuncia o que faz a quem espreita. */
const COOKIE = "fr_dv";

/** Um ano: o dispositivo do espectador não muda entre eventos. */
const MAX_AGE = 365 * 24 * 60 * 60;

/** Um `crypto.randomUUID()` e nada mais — é o formato que aceitamos de volta. */
const FORMATO = /^[0-9a-f-]{36}$/i;

/**
 * O dispositivo deste pedido, do cookie. `null` quando não há (primeiro play,
 * cookies bloqueados, cliente que não é browser).
 *
 * Valida o formato antes de acreditar: o valor vem do cliente e vai parar a
 * uma coluna e a comparações — não entra sem passar pela porta.
 */
export function readDeviceId(req: Request): string | null {
  const cru = req.headers.get("cookie");
  if (!cru) return null;

  for (const parte of cru.split(";")) {
    const [nome, ...resto] = parte.trim().split("=");
    if (nome !== COOKIE) continue;
    const valor = decodeURIComponent(resto.join("="));
    return FORMATO.test(valor) ? valor : null;
  }
  return null;
}

/** Um dispositivo novo. */
export function newDeviceId(): string {
  return newId();
}

/**
 * Escreve o cookie na resposta. Chamado sempre (não só quando é novo) para o
 * prazo se renovar a cada visualização — senão um espectador que só vê uma
 * batalha por ano voltava a contar como dispositivo novo.
 */
export function attachDeviceCookie(res: NextResponse, deviceId: string): NextResponse {
  res.cookies.set(COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    // Em desenvolvimento o site é http://localhost e um cookie `secure` era
    // simplesmente deitado fora pelo browser — ficávamos sem dispositivo e a
    // contagem de bloqueios voltava a mentir, mas só no ecrã de quem testa.
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
