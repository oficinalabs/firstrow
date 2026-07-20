import fs from "node:fs";
import path from "node:path";

/*
 * Quanto é que os gráficos custam ao bundle do cliente.
 *
 *   node scripts/medir-bundle-graficos.mjs
 *
 * A tabela do `next build` com Turbopack já não imprime tamanhos por rota, por
 * isso mede-se o que interessa mesmo: os pedaços de JavaScript que contêm
 * recharts, e o peso deles em disco e comprimidos (que é o que desce pela rede).
 *
 * Identificar por CONTEÚDO e não por nome de ficheiro é de propósito: os nomes
 * dos pedaços são hashes e mudam a cada build, mas "recharts" aparece dentro do
 * código deles (nomes de componentes, avisos). É a medição que não envelhece.
 */

import { gzipSync } from "node:zlib";

const CHUNKS = ".next/static/chunks";
const MARCADORES = ["recharts", "RechartsWrapper", "CartesianGrid"];

function ficheiros(dir) {
  const saida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...ficheiros(caminho));
    else if (entrada.name.endsWith(".js")) saida.push(caminho);
  }
  return saida;
}

const todos = ficheiros(CHUNKS);
let totalBruto = 0;
let totalGz = 0;
const comGraficos = [];
let totalBrutoGeral = 0;

for (const caminho of todos) {
  const conteudo = fs.readFileSync(caminho);
  totalBrutoGeral += conteudo.length;
  if (MARCADORES.some((m) => conteudo.includes(m))) {
    const gz = gzipSync(conteudo).length;
    comGraficos.push({ caminho, bruto: conteudo.length, gz });
    totalBruto += conteudo.length;
    totalGz += gz;
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

comGraficos.sort((a, b) => b.bruto - a.bruto);
console.info(`Pedaços com recharts: ${comGraficos.length} de ${todos.length}\n`);
for (const c of comGraficos) {
  console.info(
    `  ${path.basename(c.caminho).padEnd(44)} ${kb(c.bruto).padStart(10)}  gz ${kb(c.gz)}`,
  );
}
console.info(
  `\n  TOTAL dos gráficos${" ".repeat(26)}${kb(totalBruto).padStart(10)}  gz ${kb(totalGz)}`,
);
console.info(`  Todo o JS do cliente${" ".repeat(24)}${kb(totalBrutoGeral).padStart(10)}`);
console.info(
  `\n  Fatia dos gráficos no JS total: ${((totalBruto / totalBrutoGeral) * 100).toFixed(1)} %`,
);
