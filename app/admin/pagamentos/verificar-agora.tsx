"use client";

import { useState, useTransition } from "react";
import { verificarPagamentos } from "@/app/admin/pagamentos/actions";
import { Button } from "@/components/ui/button";

/*
 * Dispara a verificação e diz o que ela deu, em português de gente.
 *
 * O resultado importa mais do que parece: "0 pagas" é uma resposta boa — quer
 * dizer que se perguntou à Eupago e o dinheiro não está preso do nosso lado.
 * Sem esta frase, carregar no botão e não ver nada a mudar era indistinguível
 * de o botão não funcionar.
 */
function resumir(ativadas: number, perguntadas: number): string {
  if (perguntadas === 0) return "Nada por verificar de momento.";
  const perguntas =
    perguntadas === 1 ? "1 compra verificada" : `${perguntadas} compras verificadas`;
  if (ativadas === 0) return `${perguntas} — nenhuma estava paga.`;
  return ativadas === 1
    ? `${perguntas} — 1 estava paga e ficou com acesso.`
    : `${perguntas} — ${ativadas} estavam pagas e ficaram com acesso.`;
}

export function VerificarAgora() {
  const [pending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState("");

  function verificar() {
    setMensagem("");
    startTransition(async () => {
      const resultado = await verificarPagamentos();
      setMensagem(
        "error" in resultado
          ? resultado.error
          : resumir(resultado.relatorio.ativadas, resultado.relatorio.perguntadas),
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <Button variant="secondary" size="sm" onClick={verificar} disabled={pending}>
        {pending ? "A perguntar à Eupago…" : "Verificar agora"}
      </Button>
      <span aria-live="polite" className="font-mono text-2xs text-muted-foreground">
        {mensagem}
      </span>
    </div>
  );
}
