# 🎨 Design — Sistema Visual

> 🔒 fixo · ✏️ preencher · ☑️ escolher (a recomendada já vem marcada)
>
> **Cores e tipografia: a decidir na fase de design.** Personalidade, tema e regras já fixadas.

## Cores
> Define tudo como **tokens** (CSS variables). Nada de hex soltos pelos componentes.
- ✏️ **Cor primária:** `#________`  ·  _a decidir_
- ✏️ **Cor secundária:** `#________`
- ✏️ **Cor de acento / CTA:** `#________`
- ✏️ **Neutro — fundo (claro):** `#________`  ·  _off-white escolhido, não branco puro_
- ✏️ **Neutro — fundo (escuro):** `#________`
- ✏️ **Texto principal:** `#________`
- ✏️ **Texto suave / secundário:** `#________`
- 🔒 **Cores semânticas** (separadas do acento):
  - ✏️ sucesso `#______` · aviso `#______` · erro `#______`
- 🔒 **Neutros com viés:** o cinza leva um leve toque da primária (nunca cinza puro).

## Tipografia
- ✏️ **Display (títulos):** `________`  ·  _a decidir_
- ✏️ **Corpo (texto):** `________`
- ☑️ **Mono (código / dados):**
  - [x] Stack do sistema (`ui-monospace, SF Mono, …`)
  - [ ] Fonte específica: `________`
- 🔒 **Tamanho base:** 16px · **Corpo:** ~65 caracteres de largura.
- 🔒 **Escala:** define uma (ex.: 1.25) e fica nela. Títulos com `text-wrap: balance`.

## Forma & espaço
- ✏️ **Raio de cantos:** `___px`  ·  _a decidir_
- 🔒 **Espaçamento:** múltiplos de 4px. Layout com flex/grid + `gap` (não margens soltas).
- ✏️ **Largura máx. de conteúdo:** `____px`  ·  _ex.: 1120px_

## Tema
- ☑️ **Dark mode:**
  - [x] Sim — desenhar os dois temas com o mesmo cuidado
  - [ ] Só um tema (decisão deliberada): `________`
- 🔒 **Estratégia:** tokens em `:root`; override por `prefers-color-scheme` **e** `data-theme`.

## Componentes & ícones
- 🔒 **Base:** shadcn/ui + Tailwind.
- ☑️ **Primitivas:**
  - [x] Radix (default do shadcn)
  - [ ] Base UI (mais ativo em 2026)
- ✏️ **Ícones:** Lucide (default do shadcn).
- ☑️ **Componentes animados (copy-paste):**
  - [ ] Nenhum
  - [x] Magic UI (micro-interações e marketing)
  - [ ] Aceternity UI (hero spectacle: 3D, spotlights)
  - [ ] React Bits (efeitos de texto/background)

## Movimento
- ☑️ **Nível de animação:**
  - [ ] Nenhum (utilitário)
  - [x] Subtil (transições, hovers)
  - [ ] Expressivo (scroll cinematográfico, 3D)
- ☑️ **Motor:**
  - [x] Motion (default, UI de app)
  - [ ] GSAP + Lenis (sites de agência, scroll)
  - [ ] Só CSS / Tailwind
- 🔒 **Regras:** anima só `transform` / `opacity` / `filter` / `clip-path` · < 300ms · ease-out · respeita `prefers-reduced-motion`.

## Tom & acessibilidade
- ✏️ **Personalidade (3 adjetivos):** confiante, premium, direto.
- ✏️ **Evitar (anti-exemplos):** ar amador/cheesy; estética "streamer" barata; excesso de vermelho gaming. Tem de impor respeito às ligas.
- 🔒 **Contraste:** WCAG AA mínimo · foco de teclado sempre visível.
