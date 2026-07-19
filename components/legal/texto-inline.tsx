import Link from "next/link";

/*
 * Marcação inline do texto legal → nós de React.
 *
 * Três casos, e mais nenhum (ver `lib/legal/tipos.ts`):
 *
 *   **negrito**          → <strong>
 *   [texto](destino)     → ligação (interna com <Link>, externa com <a>)
 *   [o que falta]        → marcador de valor por preencher
 *
 * NÃO há `dangerouslySetInnerHTML` aqui, e é de propósito: o texto legal é o
 * único conteúdo do site que tem de ser exatamente o que está escrito no
 * ficheiro. Um renderizador que interpreta HTML deixa a porta aberta a que uma
 * alteração ao conteúdo mude a página de formas que ninguém reviu.
 */

/** A ordem das alternativas importa: negrito primeiro, link antes de marcador. */
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|\[([^\]]+)\]/g;

/**
 * Valor por preencher — `[nome legal da empresa]`, `[suporte@]`, `[90] dias`.
 *
 * Fica à vista, marcado como o que é. Uma página legal que apresenta um
 * placeholder como se fosse texto corrido faz o leitor duvidar de tudo o resto;
 * marcá-lo diz "isto ainda não está decidido" sem esconder nada.
 */
function Marcador({ conteudo }: { conteudo: string }) {
  return (
    <span className="rounded-xs bg-muted px-1 font-mono text-2sm text-muted-foreground">
      [{conteudo}]
    </span>
  );
}

function Ligacao({ destino, children }: { destino: string; children: React.ReactNode }) {
  const externa = destino.startsWith("http");
  const classe =
    "underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground";

  if (externa) {
    return (
      <a href={destino} target="_blank" rel="noopener noreferrer" className={classe}>
        {children}
      </a>
    );
  }
  return (
    <Link href={destino} className={classe}>
      {children}
    </Link>
  );
}

export function TextoInline({ texto }: { texto: string }) {
  const partes: React.ReactNode[] = [];
  let cursor = 0;

  // `exec` em ciclo (e não `.map`) porque o que se percorre é o texto, não uma
  // lista: a chave de cada pedaço é a posição onde começou, que é estável.
  const regex = new RegExp(INLINE.source, "g");
  let match = regex.exec(texto);
  while (match !== null) {
    if (match.index > cursor) partes.push(texto.slice(cursor, match.index));

    const [bruto, negrito, rotuloLink, destino, marcador] = match;
    const chave = `${match.index}:${bruto}`;

    if (negrito !== undefined) {
      // Recursivo: `**[suporte@]**` é negrito com um marcador lá dentro.
      partes.push(
        <strong key={chave} className="font-semibold text-foreground">
          <TextoInline texto={negrito} />
        </strong>,
      );
    } else if (rotuloLink !== undefined && destino !== undefined) {
      partes.push(
        <Ligacao key={chave} destino={destino}>
          {rotuloLink}
        </Ligacao>,
      );
    } else if (marcador !== undefined) {
      partes.push(<Marcador key={chave} conteudo={marcador} />);
    }

    cursor = match.index + bruto.length;
    match = regex.exec(texto);
  }

  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return <>{partes}</>;
}
