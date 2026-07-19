/*
 * Verificação da promessa de contraste da paleta de canal.
 *
 * `lib/colors.ts` promete uma coisa só, mas promete-a a sério: seja qual for a
 * cor que a liga escolher, a paleta derivada cumpre AA. Isto põe a promessa à
 * prova com milhares de cores ao acaso, porque os casos que partem o cálculo não
 * são os bonitos — são os que caem em cima do limiar.
 *
 * Uso:  pnpm dlx tsx scripts/check-contrast.ts
 * Sai com código 1 se alguma cor produzir uma paleta ilegível.
 *
 * (Foi assim que se apanhou o arredondamento para 8 bits: a procura parava numa
 * cor contínua com 4,50:1 e o hex final ficava em 4,47:1 — ver `quantize`.)
 */
import {
  contrastBetween,
  derivePalette,
  formatContrast,
  parseHexColor,
  type Surface,
} from "@/lib/colors";

/*
 * Espelho dos mesmos tokens que o lib/colors.ts mede — ver globals.css.
 * --background, --card e --muted: os três fundos onde a cor do canal assenta.
 */
const SURFACE_BACKGROUNDS: Record<Surface, string[]> = {
  dark: ["#131211", "#1b1a18", "#2b2926"],
  light: ["#f6f5f1", "#fcfbf8", "#eceae3"],
};
const SURFACE_FOREGROUND: Record<Surface, string> = { dark: "#f1efea", light: "#161512" };

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const SURFACES: Surface[] = ["dark", "light"];
const SAMPLE_SIZE = 3000;

let failures = 0;

function expect(condition: boolean, label: string, detail = "") {
  if (condition) return;
  failures += 1;
  // Só as primeiras falhas interessam: se a promessa quebra, quebra em série.
  if (failures <= 15) console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function worstAgainstBackgrounds(color: string, surface: Surface): number {
  return Math.min(...SURFACE_BACKGROUNDS[surface].map((bg) => contrastBetween(color, bg)));
}

/** Toda a paleta de uma cor, medida contra o que promete cumprir. */
function auditPalette(brand: string, second: string | null, surface: Surface) {
  const { palette } = derivePalette({ accentColor: brand, accentColorSecondary: second }, surface);
  const where = `${brand}${second ? ` + ${second}` : ""} em ${surface}`;

  const checks: Array<[string, number, number]> = [
    ["acento lê-se no fundo", worstAgainstBackgrounds(palette.accent, surface), AA_TEXT],
    ["2ª cor lê-se no fundo", worstAgainstBackgrounds(palette.secondary, surface), AA_TEXT],
    ["preenchimento vê-se", worstAgainstBackgrounds(palette.solid, surface), AA_NON_TEXT],
    ["texto assenta no preenchimento", contrastBetween(palette.solid, palette.onSolid), AA_TEXT],
    ["texto assenta no hover", contrastBetween(palette.solidHover, palette.onSolid), AA_TEXT],
    [
      "texto do tema lê-se no fundo suave",
      contrastBetween(palette.soft, SURFACE_FOREGROUND[surface]),
      AA_TEXT,
    ],
  ];

  for (const [label, achieved, minimum] of checks) {
    expect(achieved >= minimum, `${label} (${where})`, formatContrast(achieved));
  }
  return checks.map(([, achieved]) => achieved);
}

console.log("Contraste da paleta de canal\n");

// ── Âncoras: valores que a WCAG documenta, para o cálculo não derivar ────────
expect(Math.abs(contrastBetween("#000000", "#ffffff") - 21) < 0.01, "preto sobre branco = 21:1");
expect(
  Math.abs(contrastBetween("#767676", "#ffffff") - 4.54) < 0.02,
  "#767676 sobre branco ≈ 4,54:1",
);
expect(contrastBetween("#6cc24a", "#6cc24a") === 1, "cor igual a si mesma = 1:1");
expect(parseHexColor("#6C4") === "#66cc44", "hex de 3 dígitos expande");
expect(parseHexColor("#6cc24aff") === null, "hex com alfa é recusado");
expect(parseHexColor("verde") === null, "texto que não é cor é recusado");

// ── Casos com nome: os que se explicam a um humano ──────────────────────────
const NAMED: Array<[string, string]> = [
  ["verde SmokingBars", "#6cc24a"],
  ["amarelo-fluorescente", "#eae04a"],
  ["amarelo puro", "#ffff00"],
  ["ciano puro", "#00ffff"],
  ["magenta", "#ff00ff"],
  ["branco", "#ffffff"],
  ["preto", "#000000"],
  ["a cor do próprio fundo escuro", "#131211"],
  ["a cor do próprio fundo claro", "#f6f5f1"],
];

for (const surface of SURFACES) {
  console.log(`  superfície ${surface}`);
  for (const [label, hex] of NAMED) {
    const { palette, contrast, notices } = derivePalette({ accentColor: hex }, surface);
    auditPalette(hex, null, surface);
    console.log(
      `    ${label.padEnd(30)} ${hex} → ${palette.accent} ${formatContrast(contrast.accent).padStart(8)}` +
        `   preenchimento ${palette.solid} + ${palette.onSolid}` +
        (notices.length > 0 ? "   (ajustado)" : ""),
    );
  }
  console.log("");
}

// ── Ao acaso: é aqui que aparecem os casos em cima do limiar ────────────────
const randomHex = () =>
  `#${Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0")}`;

let worst = Number.POSITIVE_INFINITY;
for (let i = 0; i < SAMPLE_SIZE; i += 1) {
  const brand = randomHex();
  const second = randomHex();
  for (const surface of SURFACES) {
    const achieved = auditPalette(brand, second, surface);
    // Normaliza cada medida pelo seu mínimo: <1 seria promessa quebrada.
    worst = Math.min(worst, ...achieved.map((value, index) => value / (index === 2 ? 3 : 4.5)));
  }
}

console.log(`  ${SAMPLE_SIZE} cores ao acaso × ${SURFACES.length} superfícies`);
console.log(`  pior margem sobre o mínimo exigido: ${worst.toFixed(3)}× (tem de ser ≥ 1)\n`);

// ── Determinismo: servidor e cliente têm de derivar exatamente o mesmo ──────
const first = derivePalette({ accentColor: "#eae04a", accentColorSecondary: "#e5372b" }, "dark");
const again = derivePalette({ accentColor: "#eae04a", accentColorSecondary: "#e5372b" }, "dark");
expect(JSON.stringify(first) === JSON.stringify(again), "derivação é determinística");

// ── Entrada inválida não rebenta nem devolve cor ilegível ──────────────────
const junk = derivePalette({ accentColor: "isto não é uma cor" }, "dark");
expect(junk.contrast.accent >= AA_TEXT, "entrada inválida cai num neutro legível");

if (failures > 0) {
  console.error(`\n✗ ${failures} verificações falharam\n`);
  process.exit(1);
}
console.log("✓ a paleta cumpre AA para todas as cores testadas\n");
