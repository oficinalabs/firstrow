import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DataTableColumn<T> = {
  header: string;
  /** Números, € e datas: mono tabular alinhado à direita. */
  numeric?: boolean;
  className?: string;
  /**
   * Esta coluna é o ASSUNTO da linha (o título do evento, o nome do canal).
   *
   * Só conta no modo cartão, e é lá que é indispensável: um cartão sem título é
   * uma pilha de valores sem dizer de quem são. Em tabela não muda nada — quem
   * diz o assunto é a posição da coluna.
   *
   * Quem não marcar nenhuma coluna fica com um cartão de pares rótulo→valor,
   * que continua legível; marcar é a diferença entre legível e bom.
   */
  destaque?: boolean;
  /** Coluna de ações (Abrir · Editar · Apagar) → rodapé do cartão. */
  accoes?: boolean;
  cell: (row: T) => React.ReactNode;
};

/*
 * Tabela de dados compacta do backoffice, por cima da Table da fundação.
 * Dashboard, eventos, subscritores, ganhos e transmissão usam TODOS isto —
 * colunas declarativas, sem JSX de tabela copiado entre páginas.
 *
 * Em ecrã estreito cada linha passa a cartão. O que ISTO faz por isso é só uma
 * coisa: copiar o cabeçalho de cada coluna para a célula (`label`), para o
 * valor nunca ficar órfão quando o cabeçalho desaparece. O desenho do cartão
 * está em `app/globals.css` e é o mesmo para as catorze tabelas — ver a nota
 * lá sobre porque é que o limiar é uma consulta ao contentor e não à janela.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  footer,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Estado vazio (obrigatório desenhá-lo em todas as páginas). */
  empty?: React.ReactNode;
  /** Linha final (totais) — células a cargo de quem chama. */
  footer?: React.ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((col) => (
            <TableHead key={col.header} numeric={col.numeric}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)}>
            {columns.map((col) => (
              <TableCell
                key={col.header}
                numeric={col.numeric}
                className={col.className}
                label={col.header}
                destaque={col.destaque}
                accoes={col.accoes}
              >
                {col.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {footer}
      </TableBody>
    </Table>
  );
}
