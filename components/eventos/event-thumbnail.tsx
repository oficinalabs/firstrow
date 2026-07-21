"use client";

import { useState } from "react";
import { PosterPlaceholder } from "@/components/eventos/poster-placeholder";
import { cn } from "@/lib/utils";

/*
 * A imagem de um cartão de evento: a miniatura real da gravação por cima, o
 * placeholder listrado do design sempre por baixo.
 *
 * O placeholder é o MESMO padrão que o resto da app usa para "ainda não há
 * imagem" (cabeçalho do canal, próxima live), e está sempre presente por uma
 * razão dupla: enquanto a miniatura carrega, é o fundo que se vê (nada de salto
 * nem de vazio); se a miniatura falhar — proxy em baixo, rede a meio — fica ele,
 * em vez de um <img> partido no cartão. E sem gravação (`src` a `null`) nunca há
 * imagem, só o placeholder.
 *
 * É um componente de cliente só por causa do `onError`: é a única forma de saber
 * que a imagem não veio. O cartão à volta continua a ser servidor.
 */
export function EventThumbnail({
  src,
  label,
  className,
}: {
  /** Caminho da miniatura, ou `null` quando o evento ainda não tem gravação. */
  src: string | null;
  /** Rótulo do placeholder (ex.: "replay"), quando a imagem não aparece. */
  label: string;
  className?: string;
}) {
  // Guarda-se QUAL fonte falhou, e não um booleano: se o mesmo componente passar
  // a servir outro evento (nova `src`), a imagem nova mostra-se na mesma sem
  // precisar de repor estado — `falhouEm !== src` volta a ser verdade sozinho.
  const [falhouEm, setFalhouEm] = useState<string | null>(null);
  const mostrarImagem = src !== null && falhouEm !== src;

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <PosterPlaceholder label={label} className="absolute inset-0 size-full" />
      {mostrarImagem && (
        // `alt=""` de propósito: a miniatura é decorativa — o título do evento, ao
        // lado, já nomeia o cartão; um alt repetido seria ruído no leitor de ecrã. E
        // não usamos next/image porque a miniatura já vem dimensionada (640×360) e
        // com cache do nosso proxy: o optimizer só a re-encaminhava pela nossa própria
        // rota e re-otimizava um fotograma já pequeno. Num caminho que não pode
        // falhar, um salto a menos vale mais do que os poucos KB que pouparia.
        // biome-ignore lint/performance/noImgElement: ver a nota acima — proxy próprio, imagem já dimensionada e com cache.
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFalhouEm(src)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );
}
