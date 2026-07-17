"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  title: z.string().trim().min(3, "Dá um título ao evento (pelo menos 3 caracteres)."),
  date: z.string().min(1, "Escolhe a data."),
  time: z.string().min(1, "Escolhe a hora."),
  price: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, "Preço em euros — por exemplo, 7,50."),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof formSchema>, string>>;

// Criar evento (restyle do form original): cria o evento como rascunho e
// provisiona o live input na Cloudflare via POST /api/admin/events, depois
// segue para a página de transmissão (onde vivem as credenciais OBS).
export function EventForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setFormError("");

    const parsed = formSchema.safeParse({
      title: formData.get("title"),
      date: formData.get("date"),
      time: formData.get("time"),
      price: formData.get("price"),
    });
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors;
      setErrors({
        title: flat.title?.[0],
        date: flat.date?.[0],
        time: flat.time?.[0],
        price: flat.price?.[0],
      });
      return;
    }
    setErrors({});

    const startsAt = new Date(`${parsed.data.date}T${parsed.data.time}`);
    if (Number.isNaN(startsAt.getTime())) {
      setErrors({ date: "Esta data não existe — confirma o dia e a hora." });
      return;
    }
    const priceCents = Math.round(Number(parsed.data.price.replace(",", ".")) * 100);
    if (priceCents <= 0) {
      setErrors({ price: "O preço tem de ser maior que zero." });
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: parsed.data.title,
          startsAt: startsAt.toISOString(),
          priceCents,
        }),
      });
      if (!res.ok) {
        setFormError("Não deu para criar o evento. Espera um momento e tenta outra vez.");
        return;
      }
      const data = (await res.json()) as { id: string };
      router.push(`/admin/eventos/${data.id}/transmissao`);
      router.refresh();
    } catch {
      setFormError("Sem ligação ao servidor. Confirma a internet e tenta de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={submit} className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Detalhes do evento</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="event-title">Título</FieldLabel>
            <Input
              id="event-title"
              name="title"
              placeholder="SB Clash #15 — Regresso às aulas"
              aria-invalid={errors.title ? true : undefined}
            />
            <FieldError>{errors.title}</FieldError>
          </Field>
          <div className="grid grid-cols-2 gap-3.5">
            <Field>
              <FieldLabel htmlFor="event-date">Data</FieldLabel>
              <Input
                id="event-date"
                name="date"
                type="date"
                className="font-mono"
                aria-invalid={errors.date ? true : undefined}
              />
              <FieldError>{errors.date}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="event-time">Hora</FieldLabel>
              <Input
                id="event-time"
                name="time"
                type="time"
                className="font-mono"
                aria-invalid={errors.time ? true : undefined}
              />
              <FieldError>{errors.time}</FieldError>
            </Field>
          </div>
          {/* TODO(frente-d/roadmap): local, descrição e cartaz precisam de
              colunas novas em events — ficam para quando o schema as tiver. */}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Acesso à live</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="event-price">Preço PPV</FieldLabel>
              <div className="flex">
                <Input
                  id="event-price"
                  name="price"
                  inputMode="decimal"
                  placeholder="7,50"
                  className="rounded-r-none text-right font-mono"
                  aria-invalid={errors.price ? true : undefined}
                />
                <span className="flex items-center rounded-r-sm border border-l-0 border-input bg-muted px-3.5 font-mono text-sm text-muted-foreground">
                  €
                </span>
              </div>
              <FieldError>{errors.price}</FieldError>
              <FieldHint>Uma compra dá acesso à live deste evento.</FieldHint>
            </Field>
          </CardContent>
        </Card>

        {/* TODO(frente-d): secção "Bilhetes físicos" (lotação + preço) entra
            quando a Frente D acrescentar ticket_price_cents/ticket_capacity. */}

        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "A criar evento…" : "Criar evento"}
            </Button>
            <FieldHint>
              Fica como rascunho. As credenciais OBS e o botão de pôr no ar estão na página de
              transmissão.
            </FieldHint>
            <FieldError>{formError}</FieldError>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
