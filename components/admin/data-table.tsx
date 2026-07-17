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
  cell: (row: T) => React.ReactNode;
};

// Tabela de dados compacta do backoffice, por cima da Table da fundação.
// Dashboard, eventos, subscritores, ganhos e transmissão usam TODOS isto —
// colunas declarativas, sem JSX de tabela copiado entre páginas.
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
              <TableCell key={col.header} numeric={col.numeric} className={col.className}>
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
