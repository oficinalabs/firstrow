"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/*
 * "Continuar com Google".
 *
 * O G vai a uma cor só (currentColor) de propósito: a regra do repo é zero hex
 * fora de globals.css, e o desenho é tinta sobre papel — um logo a quatro
 * cores destoava do resto do ecrã.
 *
 * Só é renderizado quando o Google está configurado no servidor (ver
 * `authCapabilities` em lib/auth.ts) — nunca mostramos um botão que rebenta.
 */

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="size-4"
      fill="currentColor"
    >
      <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.344-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" />
    </svg>
  );
}

export function GoogleButton({ redirectTo }: { redirectTo: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    // O Better Auth trata do redirect; se algo falhar (ex.: a conta local
    // ainda não confirmou o email) volta a /entrar com ?error=… explicado lá.
    await authClient.signIn.social({
      provider: "google",
      callbackURL: redirectTo,
      errorCallbackURL: "/entrar",
    });
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="lg" onClick={onClick} disabled={loading} className="w-full">
      <GoogleMark />
      {loading ? "A abrir o Google…" : "Continuar com Google"}
    </Button>
  );
}
