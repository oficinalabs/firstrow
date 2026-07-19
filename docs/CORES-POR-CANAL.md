# Cores por canal — personalização com contraste garantido

> Estado: **implementado, por integrar** (2026-07-19). Componentes prontos; falta ligar à tabela
> `channels` da Frente E. Ver [ROADMAP.md](ROADMAP.md) § "Cores por canal".
>
> Código: `lib/colors.ts` · `components/ui/tenant-scope.tsx` · `components/admin/` · `scripts/check-contrast.ts`

Cada liga escolhe **1 ou 2 cores** e a página `/canal/[slug]` passa a usá-las — sem partir a
legibilidade nem diluir a identidade FirstRow.

## A regra: a cor nunca se recusa

Uma cor com pouco contraste **não é um erro de validação**. É uma cor que o sistema ajusta em
luminosidade até cumprir AA, e depois **diz à pessoa o que fez**.

Recusar era pôr uma liga a adivinhar hexadecimais até acertar. Só se recusa o que não é cor de todo
(`"verde"`, `#zzz`, hex com canal alfa — este último porque uma cor semitransparente torna o
contraste indefinido e a promessa de AA deixava de valer).

```
amarelo-fluorescente  #eae04a → #eae04a  (10,54:1)  na página do canal, passa tal e qual
amarelo-fluorescente  #eae04a → #716c1f  ( 4,51:1)  no backoffice, é o que se lê em papel
azul-escuro           #0b1f6b → #7d90b8  ( 4,53:1)  clareado, e o ecrã diz que clareou
```

## As variáveis CSS

Injetadas no subtree por `tenantStyle()` / `<TenantScope>`. Consomem-se como qualquer var do
projeto: `text-(--tenant)`, `bg-(--tenant-solid)`, `bg-(--tenant-soft)`.

| Variável | Uso | Garantia |
|---|---|---|
| `--tenant` | texto e ícones na cor da liga | **4,5:1** (WCAG 1.4.3) |
| `--tenant-solid` | preenchimento: filete, avatar, chip | **3:1** (1.4.11) **e** tem par de texto AA |
| `--tenant-on-solid` | o texto que assenta em `--tenant-solid` | **4,5:1** |
| `--tenant-hover` | hover de `--tenant-solid` | afasta-se do próprio texto, nunca se aproxima |
| `--tenant-soft` | fundo suave tingido da marca | `--foreground` mantém **4,5:1** por cima |
| `--tenant-2` | 2ª cor como acento de texto | **4,5:1** |
| `--tenant-2-solid` | 2ª cor como preenchimento | **3:1** |
| `--tenant-rule` | filete de co-branding (`background`) | uma cor, ou corte seco a 64% entre as duas |

Sem 2ª cor, `--tenant-2*` caem na principal — quem consome nunca precisa de saber se a liga
escolheu uma ou duas.

Falta um par de texto para a 2ª cor? Não se inventa: `textColorOn(fill)` devolve o certo.

## Como usar

```tsx
// Num elemento que já existe (não custa uma <div> a mais)
<div style={tenantStyle(channel, "dark")}>…</div>

// Num subtree próprio
<TenantScope channel={channel} surface="dark" data-theme="dark">…</TenantScope>
```

`surface` é o tema em que o elemento vive: `"dark"` no espectador, `"light"` no backoffice. A mesma
cor precisa de derivações diferentes para se ler em papel e em fundo escuro.

Já ligado em `ViewerShell`, `BackofficeShell` e `ChannelRow`.

### A barra da FirstRow deriva à parte

`BackofficeShell` deriva a cor **duas vezes**, e não é desperdício: a página é papel mas a barra
(`--bar`, `#0f0e0c`) é escura nos dois temas. Cumprir 4,5:1 contra papel **e** contra quase-preto ao
mesmo tempo é aritmeticamente impossível — precisava de luminância ≤0,176 e ≥0,194. Não é um caso
especial, é a única solução: cada superfície deriva a sua.

## Como a paleta é calculada

Converte-se a cor para **OKLCH** e empurra-se a luminosidade na direção contrária à superfície — **o
mínimo que baste**, para a marca ficar o mais perto possível do que a liga escolheu. Procura binária
com 20 bissecções; o croma desce ao longo do caminho, o que garante que o extremo (branco ou preto)
é sempre alcançável e a procura termina sempre com resposta.

**Porquê OKLCH e não HSL:** em HSL o `L` significa coisas diferentes conforme o tom — amarelo a 50%
brilha muito mais que azul a 50%, e "escurecer 10%" dá saltos imprevisíveis. Em OKLCH o `L` é
luminosidade percetual: escurecer um amarelo dá um amarelo escuro, não um castanho lamacento.

Mede-se contra `--background`, `--card` **e `--muted`**, e vale o pior dos três.

`lib/colors.ts` é o **único ficheiro do projeto com cores em hex fora do `globals.css`**, e por uma
razão concreta: contraste é aritmética e precisa dos números das superfícies antes de haver browser
para resolver as vars CSS (o cálculo corre no servidor, no render). O bloco `SURFACES` é espelho dos
tokens do `globals.css` — se a paleta base mudar lá, muda aqui.

### Sem flash e sem hydration mismatch

As duas garantias saem da mesma decisão — derivar no render, em estilo inline, sem efeitos:

- As vars vão no HTML que o servidor manda. Não há primeiro-pintar-com-a-cor-antiga seguido de
  correção. É por isto que não se usa `useEffect` nem `getComputedStyle`: qualquer um dos dois só
  corre depois de haver ecrã.
- `derivePalette` é pura e determinística — mesma cor e mesma superfície dão sempre o mesmo hex, no
  servidor e no browser. O que o React compara na hidratação bate certo por construção.

## O que NÃO muda com o canal

Não é esquecimento — é o que impede o co-branding de virar white-label:

- **O vermelho AO VIVO** (`--live`) é intocável: sinal de estado, não de marca.
- **Botões de pagamento e checkout** usam a ação da FirstRow (tinta). Dinheiro tem de parecer sempre
  igual, venha de que canal vier.
- **`/bilhetes` e `/conta`** são transversais: são da FirstRow, não da liga.
- A cor é **só para acentos** — nunca repinta superfícies inteiras.

A pré-visualização no seletor mostra os três de propósito, para quem escolhe a cor perceber a regra
no momento em que ela importa.

## Componentes

| Componente | Props |
|---|---|
| `ChannelForm` | `initialValues?: Partial<ChannelFormValues>` · `onSubmit: (draft: ChannelDraft) => Promise<ChannelSubmitResult>` · `mode?: "create" \| "edit"` |
| `BrandColorPicker` | `accentColor` · `accentColorSecondary` (`""` = uma cor só) · `onAccentChange` · `onSecondaryChange` · `errors?` |
| `ChannelPreview` | `channel: ChannelDraft` |
| `TenantScope` | `channel?: BrandedChannel \| null` · `surface: Surface` · resto de `<div>` |

`ChannelSubmitResult = { message?: string; errors?: ChannelFieldErrors } | void` — devolver erro
reabre o formulário; devolver nada deixa o botão desativado enquanto se navega.

O formulário **não faz fetch nem toca em `server/`**: recebe valores iniciais e um handler. Segue as
três garantias do [`event-form.tsx`](../components/admin/event-form.tsx) — erro nunca limpa o que a
pessoa escreveu, erro cala-se ao editar o campo, botão desativa ao primeiro clique. Foi de um
formulário sem elas que nasceram 16 eventos duplicados.

### O tipo de canal

```ts
// lib/colors.ts — o mínimo que o sistema de cor precisa.
// O `Channel` de lib/channels.ts já satisfaz isto sem conversão.
type BrandedChannel = { accentColor: string; accentColorSecondary?: string | null }

// components/admin/channel-rules.ts — o que o formulário produz.
type ChannelDraft = {
  slug: string; name: string; tagline: string
  logoUrl: string | null; bannerUrl: string | null
  accentColor: string                      // sempre "#rrggbb" minúsculo
  accentColorSecondary: string | null      // null = uma cor só
  initials: string
}
```

**Campo novo a acrescentar em `channels`:** `accent_color_secondary text NULL`. Mais nada.
`accent_color` deve ser `NOT NULL` com default `'#6cc24a'`; e `initials` pode deixar de ser guardado
— `initialsFrom(name)` deriva-o ("SmokingBars" → SB, "Liga do Norte" → LN).

## Verificação

```
pnpm dlx tsx scripts/check-contrast.ts
```

Põe a promessa à prova com 3000 cores ao acaso × 2 superfícies × 6 medições. Sai com 1 se alguma cor
produzir paleta ilegível. **Correr sempre que se mexer no cálculo ou nos tokens do `globals.css`.**

Duas coisas que este teste apanhou e que a leitura do código não apanhava:

1. **Arredondamento a 8 bits.** A procura parava numa cor contínua com 4,50:1 e o `toHex` empurrava-a
   de volta para 4,47:1. Agora mede-se sempre a cor quantizada — a que vai mesmo aparecer. Ver
   `quantize()`.
2. **O `--muted` faltava na conta.** É o fundo do avatar do canal, onde as iniciais são escritas na
   cor da liga. Sem ele, cores ajustadas ficavam-se pelos 3,8:1 exactamente no sítio onde a cor da
   liga mais aparece. Ver `backdrops()`.

## Por fazer

- **Upload de logo/banner.** Só se aceitam caminhos internos (`/brand/…`): o `next.config.ts` não
  tem `images.remotePatterns`, e aceitar `https://` deixava gravar um logo que rebentava a página do
  canal ao renderizar. Decisão de infra — ou domínios autorizados, ou pipeline de upload.
  (Recusa-se também `//dominio.pt/x.png`: começa por `/` mas é um pedido a um servidor de fora
  disfarçado de caminho interno.)
- **Mover `components/admin/channel-rules.ts` para `lib/channel-rules.ts`**, a par do
  `lib/event-rules.ts`. Ficou em `components/` por fronteira de frentes; é só mudar o import quando
  houver server action.
- **`app/(marketing)/sobre/page.tsx`** ainda põe `--tenant` à mão com a cor crua sobre fundo claro
  (≈2,3:1). É um ponto decorativo, mas beneficiava de `tenantStyle(defaultChannel, "light")`.
- **O veredito do seletor mostra só a superfície escura** (a página do canal). Hoje conta a história
  toda, porque no backoffice a cor da liga só aparece na barra, que também é escura. Se alguma
  frente puser a cor no *conteúdo* do backoffice, o seletor passa a ter de mostrar as duas.
- **Página do canal preenchida por validar a olho** — a moldura, o filete e as vars estão medidos,
  mas o hero/agenda/arquivo com dados a sério ainda não foram vistos.
