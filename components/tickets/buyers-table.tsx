"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type BuyerRow = {
  id: string;
  codigo: string | null;
  nome: string;
  email: string;
  /** Data de compra já formatada no servidor (lib/format). */
  comprado: string;
  estado: string;
  /** Hora de entrada já formatada no servidor; null se não entrou. */
  usadoAs: string | null;
};

function EstadoBadge({ estado, usadoAs }: { estado: string; usadoAs: string | null }) {
  if (estado === "used") {
    return <Badge variant="success">Entrou{usadoAs ? ` ${usadoAs}` : ""}</Badge>;
  }
  if (estado === "refunded") return <Badge variant="muted">Reembolsado</Badge>;
  return (
    <Badge variant="outline" className="text-foreground">
      Por usar
    </Badge>
  );
}

/** Tabela de compradores com filtro local por nome, email ou código. */
export function BuyersTable({ rows }: { rows: BuyerRow[] }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.nome.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.codigo ?? "").toLowerCase().includes(q),
      )
    : rows;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-base font-bold">Compradores</h2>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="procurar nome, email ou código…"
          aria-label="Procurar comprador"
          className="h-9 max-w-66"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-2sm text-muted-foreground">
          Nenhum comprador corresponde a "{query}".
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Comprador</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Comprado</TableHead>
              <TableHead className="text-right">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs font-medium">{r.codigo ?? "—"}</TableCell>
                <TableCell>{r.nome}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.email}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.comprado}
                </TableCell>
                <TableCell className="text-right">
                  <EstadoBadge estado={r.estado} usadoAs={r.usadoAs} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
