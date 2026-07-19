import { TextoInline } from "@/components/legal/texto-inline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Bloco } from "@/lib/legal/tipos";

/*
 * Renderização dos blocos de texto legal.
 *
 * Um documento legal lê-se de cima a baixo, muitas vezes ao telemóvel e a
 * meio de uma compra. Por isso: 16px de corpo, entrelinha larga, largura
 * limitada em ~68 caracteres (o `max-w` está no invólucro da página), e nada
 * que peça atenção que o texto não merece — sem caixas decorativas, sem cor a
 * fazer de ênfase.
 */

function BlocoUnico({ bloco }: { bloco: Bloco }) {
  switch (bloco.t) {
    case "p":
      return (
        <p className="text-base leading-relaxed text-foreground-secondary">
          <TextoInline texto={bloco.texto} />
        </p>
      );

    case "sub":
      return (
        <h3 className="mt-2 font-display text-base font-bold text-foreground">
          <TextoInline texto={bloco.texto} />
        </h3>
      );

    case "nota":
      // "Base legal: …" — presente em quase todos os tratamentos de dados, e
      // discreto de propósito: qualifica o parágrafo anterior, não compete com ele.
      return (
        <p className="text-2sm italic leading-relaxed text-muted-foreground">
          <TextoInline texto={bloco.texto} />
        </p>
      );

    case "lista": {
      const Marcadores = bloco.numerada ? "ol" : "ul";
      return (
        <Marcadores
          className={`flex list-outside flex-col gap-2 pl-5 ${
            bloco.numerada ? "list-decimal" : "list-disc"
          } marker:text-muted-foreground`}
        >
          {bloco.itens.map((item) => (
            <li key={item} className="text-base leading-relaxed text-foreground-secondary">
              <TextoInline texto={item} />
            </li>
          ))}
        </Marcadores>
      );
    }

    case "tabela":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              {bloco.colunas.map((coluna) => (
                <TableHead key={coluna}>{coluna}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bloco.linhas.map((linha) => (
              // A primeira célula identifica a linha — serve de chave.
              <TableRow key={linha[0]}>
                {linha.map((celula, coluna) => (
                  <TableCell
                    key={bloco.colunas[coluna]}
                    className="py-3 align-top text-2sm leading-relaxed"
                  >
                    <TextoInline texto={celula} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );

    case "advogado":
      // Dívida assumida, não texto por acabar. O rótulo fica textual (não é só
      // uma cor de fundo) para quem lê com leitor de ecrã perceber o mesmo que
      // quem vê a caixa.
      return (
        <div className="rounded-sm border border-border bg-muted/50 p-3.5">
          <p className="font-mono text-2xs font-semibold uppercase tracking-label text-muted-foreground">
            [VERIFICAR COM ADVOGADO]
          </p>
          <p className="mt-1.5 text-2sm leading-relaxed text-foreground-secondary">
            <TextoInline texto={bloco.texto} />
          </p>
        </div>
      );
  }
}

/** Uma sequência de blocos, com o espaçamento entre eles no sítio certo. */
export function Blocos({ blocos }: { blocos: readonly Bloco[] }) {
  /*
   * Chaves por contador e não por índice do `.map`: dois blocos podem ter texto
   * igual (o "Base legal: execução do contrato." aparece três vezes na
   * privacidade) e a chave tem de os distinguir na mesma.
   */
  const nos: React.ReactNode[] = [];
  let n = 0;
  for (const bloco of blocos) {
    n += 1;
    nos.push(<BlocoUnico key={`b${n}`} bloco={bloco} />);
  }
  return <div className="flex flex-col gap-3.5">{nos}</div>;
}
