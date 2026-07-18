/*
 * Política de password — FONTE ÚNICA DE VERDADE.
 *
 * O mesmo módulo corre nos dois lados:
 *   · servidor — `lib/auth.ts` (hook `before` do Better Auth) é quem MANDA;
 *   · cliente  — checklist em tempo real no registo e na redefinição.
 * Mudar uma regra aqui muda os dois lados. Nunca duplicar estas regras noutro
 * sítio: o cliente é conveniência, a decisão é sempre do servidor.
 *
 * Sem dependências (vai no bundle do cliente) e sem regex \p{…} — o `target`
 * do tsconfig é ES2017, por isso os intervalos acentuados vão explícitos.
 */

export const PASSWORD_MIN_LENGTH = 10;
/** Teto do Better Auth (bcrypt corta aos 72 bytes; 128 é folgado e seguro). */
export const PASSWORD_MAX_LENGTH = 128;

/** Contexto opcional: permite recusar passwords feitas do próprio email/nome. */
export type PasswordContext = { email?: string; name?: string };

export type PasswordRule = {
  id: string;
  /** Texto do checklist — PT-PT, curto, na voz do produto. */
  label: string;
  test: (password: string, context: PasswordContext) => boolean;
};

// Letras acentuadas contam como letras (é uma app PT): À-Ö Ø-Þ maiúsculas,
// ß-ö ø-ÿ minúsculas. Símbolo = o que não for letra, dígito ou espaço.
const UPPERCASE = /[A-ZÀ-ÖØ-Þ]/;
const LOWERCASE = /[a-zß-öø-ÿ]/;
const DIGIT = /[0-9]/;
const SYMBOL = /[^A-Za-z0-9À-ÖØ-öø-ÿ\s]/;

/*
 * Passwords óbvias. Lista curta e afiada: os clássicos internacionais, os
 * padrões de teclado, e o que de facto se usa em Portugal (clubes, "benfica",
 * "sporting", nomes próprios comuns, "portugal"). Não é uma lista de milhões —
 * é a primeira linha; a entropia real vem do comprimento + variedade.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "passw0rd",
  "senha",
  "palavrapasse",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "12345",
  "qwerty",
  "qwertyui",
  "qwertyuiop",
  "azerty",
  "asdfgh",
  "asdfghjkl",
  "zxcvbn",
  "zxcvbnm",
  "abc123",
  "abcdef",
  "abcdefg",
  "abcdefgh",
  "letmein",
  "welcome",
  "bemvindo",
  "admin",
  "administrador",
  "root",
  "user",
  "utilizador",
  "login",
  "entrar",
  "iloveyou",
  "amote",
  "princess",
  "princesa",
  "dragon",
  "monkey",
  "sunshine",
  "football",
  "futebol",
  "baseball",
  "master",
  "shadow",
  "michael",
  "jennifer",
  "trustno",
  "superman",
  "batman",
  "starwars",
  "pokemon",
  "computer",
  "internet",
  "secret",
  "segredo",
  "liberdade",
  "amizade",
  "familia",
  "saudade",
  "portugal",
  "lisboa",
  "porto",
  "benfica",
  "sporting",
  "slbenfica",
  "scporting",
  "fcporto",
  "bracga",
  "braga",
  "vitoria",
  "gloriososlb",
  "cristiano",
  "ronaldo",
  "cr",
  "joao",
  "maria",
  "manuel",
  "antonio",
  "francisco",
  "carolina",
  "matilde",
  "beatriz",
  "rodrigo",
  "santos",
  "silva",
  "ferreira",
  "firstrow",
  "primeirafila",
  "qwerty123",
  "password1",
  "pass",
  "teste",
  "test",
  "temporaria",
  "mudar",
  "alterar",
  "novapassword",
  "minhapassword",
]);

/** Substituições "leet" mais usadas — para apanhar P@ssw0rd e companhia. */
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
  "+": "t",
  "€": "e",
};

function deLeet(value: string): string {
  let out = "";
  for (const char of value) out += LEET[char] ?? char;
  return out;
}

/**
 * Formas "reduzidas" da password, para comparar com a lista de óbvias.
 * Tira o sufixo decorativo ("Benfica2024!" → "benfica") e desfaz o leet
 * ("P@ssw0rd" → "password") — é aí que mora a password real.
 */
function reducedForms(password: string): string[] {
  const lower = password.toLowerCase().trim();
  const bases = new Set([lower, lower.replace(/[\d\W_]+$/, "")]);
  const forms = new Set<string>();
  for (const base of bases) {
    forms.add(base.replace(/[^a-z0-9]/g, ""));
    forms.add(deLeet(base).replace(/[^a-z]/g, ""));
  }
  forms.delete("");
  return [...forms];
}

/** Sequências corridas de 5+ ("12345", "abcde", "54321") — previsíveis. */
function hasRun(password: string): boolean {
  const lower = password.toLowerCase();
  let ascending = 1;
  let descending = 1;
  for (let i = 1; i < lower.length; i++) {
    const delta = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    ascending = delta === 1 ? ascending + 1 : 1;
    descending = delta === -1 ? descending + 1 : 1;
    if (ascending >= 5 || descending >= 5) return true;
  }
  return false;
}

/** Pedaços do email/nome com 4+ letras — "rui.costa@x.pt" → ["rui", "costa"]. */
function personalTokens({ email, name }: PasswordContext): string[] {
  const local = email?.split("@")[0] ?? "";
  return [...local.split(/[^a-zA-Z0-9]+/), ...(name ?? "").split(/\s+/)]
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4);
}

function isObvious(password: string, context: PasswordContext): boolean {
  if (!password) return true;
  const forms = reducedForms(password);
  if (forms.some((form) => COMMON_PASSWORDS.has(form))) return true;
  if (hasRun(password)) return true;
  // Pouca variedade real: "Aaaaaaaa1!" tem 10 caracteres mas 4 distintos.
  if (new Set(password.toLowerCase()).size <= 4) return true;
  const tokens = personalTokens(context);
  return tokens.some((token) => forms.some((form) => form.includes(token)));
}

/*
 * As regras, pela ordem em que aparecem no checklist. Cada uma é uma frase
 * curta que o utilizador consegue cumprir — nada de "deve conter pelo menos
 * um caractere não alfanumérico".
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (password) =>
      password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
  },
  { id: "uppercase", label: "Uma letra maiúscula", test: (password) => UPPERCASE.test(password) },
  { id: "lowercase", label: "Uma letra minúscula", test: (password) => LOWERCASE.test(password) },
  { id: "digit", label: "Um número", test: (password) => DIGIT.test(password) },
  { id: "symbol", label: "Um símbolo (! ? @ # …)", test: (password) => SYMBOL.test(password) },
  {
    id: "not-obvious",
    label: "Nada de passwords óbvias",
    test: (password, context) => !isObvious(password, context),
  },
] as const;

export type PasswordCheck = {
  ok: boolean;
  /** ids das regras cumpridas — o checklist pinta estas de verde. */
  passed: string[];
  /** ids das regras por cumprir, pela ordem do checklist. */
  failed: string[];
};

/** Avalia a password contra todas as regras. Serve o servidor e o cliente. */
export function checkPassword(password: string, context: PasswordContext = {}): PasswordCheck {
  const passed: string[] = [];
  const failed: string[] = [];
  for (const rule of PASSWORD_RULES) {
    (rule.test(password, context) ? passed : failed).push(rule.id);
  }
  return { ok: failed.length === 0, passed, failed };
}

/**
 * Frase única para o erro do servidor — diz a regra que falta, não um código.
 * (No cliente o checklist já mostra tudo; isto é a rede de segurança.)
 */
export function passwordPolicyMessage(failed: string[]): string {
  if (failed.includes("not-obvious") && failed.length === 1) {
    return "Essa password é demasiado fácil de adivinhar. Escolhe outra que não tenha nada a ver contigo.";
  }
  const missing = PASSWORD_RULES.filter(
    (rule) => failed.includes(rule.id) && rule.id !== "not-obvious",
  ).map((rule) => rule.label.toLowerCase());

  if (missing.length === 0) {
    return "Essa password não cumpre as regras. Vê a lista por baixo do campo.";
  }
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} e ${missing[missing.length - 1]}`;
  return `Falta à password: ${list}.`;
}
