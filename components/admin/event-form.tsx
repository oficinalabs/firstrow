"use client";

import { useState } from "react";

type LiveInput = { rtmpsUrl: string; streamKey: string };

export function AdminEventForm() {
  const [result, setResult] = useState<LiveInput | null>(null);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setError("");
    setResult(null);

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        startsAt: formData.get("startsAt"),
        priceCents: Math.round(Number(formData.get("price")) * 100),
      }),
    });

    if (!res.ok) {
      setError("Erro ao criar evento.");
      return;
    }

    const data = (await res.json()) as { liveInput: LiveInput };
    setResult(data.liveInput);
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input
        name="title"
        placeholder="Título do evento"
        required
        className="h-11 rounded-lg border border-foreground/15 bg-transparent px-4 text-sm"
      />
      <input
        name="startsAt"
        type="datetime-local"
        required
        className="h-11 rounded-lg border border-foreground/15 bg-transparent px-4 text-sm"
      />
      <input
        name="price"
        type="number"
        step="0.01"
        placeholder="Preço (€)"
        required
        className="h-11 rounded-lg border border-foreground/15 bg-transparent px-4 text-sm"
      />
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-5 text-sm font-medium text-background"
      >
        Criar evento + live input
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded-lg border border-foreground/15 p-4 text-sm">
          <p className="font-medium">Configura o OBS com:</p>
          <p className="mt-1 break-all text-foreground/70">Servidor: {result.rtmpsUrl}</p>
          <p className="break-all text-foreground/70">Chave: {result.streamKey}</p>
        </div>
      )}
    </form>
  );
}
