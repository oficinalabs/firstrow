import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/auth";

/*
 * Cliente do Better Auth (browser).
 *
 * `inferAdditionalFields` traz o `role` para dentro do tipo de `session.user`
 * — só tipos, nada do servidor entra no bundle (o import é `type`).
 * Atenção: o `role` no cliente serve para PINTAR ecrãs, nunca para autorizar.
 * Quem decide é sempre o servidor (ver `server/authz.ts`).
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
