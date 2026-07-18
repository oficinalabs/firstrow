import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";
import { DEFAULT_ROLE } from "@/db/auth-schema";
import { isEmailEnabled, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import { env } from "@/lib/env";
import {
  checkPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
} from "@/lib/password-policy";

/*
 * Configuração do Better Auth. Decisões e porquês (lê antes de mexer):
 *
 * 1. POLÍTICA DE PASSWORD — quem manda é o servidor. O checklist do cliente é
 *    conveniência; a regra corre outra vez aqui, no hook `before`, para TODOS
 *    os caminhos que definem uma password (registo, redefinição, mudança).
 *
 * 2. GOOGLE — só é ligado se houver credenciais. Sem elas o provider nem entra
 *    na config e a UI não mostra o botão: mais vale não haver botão do que um
 *    botão que rebenta.
 *
 * 3. VERIFICAÇÃO DE EMAIL — a barreira no login (`requireEmailVerification`)
 *    acompanha o `RESEND_API_KEY`. Sem forma de enviar o email, exigir
 *    verificação trancava toda a gente à porta para sempre; com Resend ligado
 *    (produção) a barreira está de pé. Nunca fingimos que enviámos — ver
 *    `isEmailEnabled()` em lib/email.ts.
 *
 * 4. ASSOCIAÇÃO DE CONTAS (Google + password no mesmo email) — ver o bloco
 *    `account.accountLinking` mais abaixo; é onde mora o risco de takeover.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const emailEnabled = isEmailEnabled();

if (!emailEnabled) {
  console.warn(
    "[auth] RESEND_API_KEY em falta — emails de ativação não são enviados e o login NÃO exige email confirmado. Define RESEND_API_KEY para ligar a verificação.",
  );
}

/**
 * Link de ativação. Construído aqui para haver UM sítio que decide o formato.
 *
 * O `callbackURL` leva o email porque é para onde o Better Auth atira também
 * quando o token falha (acrescenta &error=TOKEN_EXPIRED). Sem o email ali, um
 * link expirado dava um beco sem saída — a página não tinha para quem reenviar.
 */
function buildVerificationUrl(token: string, userEmail: string): string {
  const callback = encodeURIComponent(
    `/verificar-email?confirmado=1&email=${encodeURIComponent(userEmail)}`,
  );
  return `${env.BETTER_AUTH_URL}/api/auth/verify-email?token=${token}&callbackURL=${callback}`;
}

/** Link de redefinição — aponta direto à nossa página, sem saltos extra. */
function buildPasswordResetUrl(token: string): string {
  return `${env.BETTER_AUTH_URL}/redefinir-password?token=${token}`;
}

/*
 * Caminhos que definem uma password nova. Se o Better Auth acrescentar outro,
 * junta-o aqui — é esta lista que garante que a política não tem portas
 * das traseiras.
 */
const PASSWORD_PATHS = new Set([
  "/sign-up/email",
  "/reset-password",
  "/change-password",
  "/set-password",
]);

type PasswordBody = {
  password?: unknown;
  newPassword?: unknown;
  email?: unknown;
  name?: unknown;
};

/**
 * Guarda da política de password (servidor). Corre antes do endpoint: se a
 * password não cumprir, nada é escrito na base de dados.
 */
const enforcePasswordPolicy = createAuthMiddleware(async (ctx) => {
  if (!PASSWORD_PATHS.has(ctx.path)) return;

  const body = ctx.body as PasswordBody | undefined;
  const candidate = typeof body?.password === "string" ? body.password : body?.newPassword;
  // Sem password no corpo não há nada a validar — o endpoint trata do erro.
  if (typeof candidate !== "string") return;

  const result = checkPassword(candidate, {
    email: typeof body?.email === "string" ? body.email : undefined,
    name: typeof body?.name === "string" ? body.name : undefined,
  });

  if (!result.ok) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_POLICY",
      message: passwordPolicyMessage(result.failed),
    });
  }
});

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),

  user: {
    additionalFields: {
      /*
       * `input: false` é o que impede escalada de privilégios: mesmo que
       * alguém mande {"role":"platform_admin"} no registo, o Better Auth
       * força o valor por defeito. Promoções só por SQL/backoffice.
       */
      role: {
        type: "string",
        input: false,
        defaultValue: DEFAULT_ROLE,
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // Ver nota 3 no topo: a barreira acompanha a capacidade real de enviar email.
    requireEmailVerification: emailEnabled,
    // Redefinir password fecha as outras sessões — se a conta andava roubada,
    // repor a password expulsa quem lá estava.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      const url = buildPasswordResetUrl(token);
      const result = await sendPasswordResetEmail({
        to: user.email,
        nome: user.name || undefined,
        urlRedefinicao: url,
      });
      // Mesma rede de segurança do email de ativação: em dev sem Resend, o
      // link sai na consola. NUNCA em produção — é uma credencial.
      if (!result.sent && process.env.NODE_ENV !== "production") {
        console.info(`[auth] (dev) link de nova password para ${user.email}: ${url}`);
      }
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Tentou entrar sem ter confirmado? Vai um link novo no mesmo movimento.
    sendOnSignIn: true,
    // Confirmar o email já deixa a pessoa dentro — não a mandamos entrar outra vez.
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 h
    sendVerificationEmail: async ({ user, token }) => {
      const url = buildVerificationUrl(token, user.email);
      const result = await sendVerificationEmail({
        to: user.email,
        nome: user.name || undefined,
        emailConta: user.email,
        urlVerificacao: url,
      });
      // Em desenvolvimento sem Resend, o link vai para a consola do servidor —
      // senão não havia forma de fechar o ciclo em local. NUNCA em produção:
      // este link é uma credencial.
      if (!result.sent && process.env.NODE_ENV !== "production") {
        console.info(`[auth] (dev) link de ativação para ${user.email}: ${url}`);
      }
    },
  },

  account: {
    /*
     * ASSOCIAÇÃO DE CONTAS — o ponto sensível do Google.
     *
     * Cenário do ataque (account pre-hijacking): alguém regista
     * vitima@gmail.com com password, sem nunca confirmar o email. Mais tarde a
     * vítima entra com o Google. Se ligássemos as duas contas às cegas, o
     * atacante ficava com uma password válida para a conta da vítima.
     *
     * Por isso: só ligamos ao Google uma conta local com email JÁ CONFIRMADO
     * (`requireLocalEmailVerified`) e só quando o Google confirma o email dele.
     * `trustedProviders` fica VAZIO de propósito — pôr "google" aqui passava a
     * aceitar emails não verificados do provider e reabria o buraco.
     *
     * Quando a ligação é recusada, o Better Auth manda o utilizador para o
     * `errorCallbackURL` com ?error=account_not_linked — /entrar explica o que
     * fazer em português.
     */
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: true,
      trustedProviders: [],
    },
  },

  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: GOOGLE_CLIENT_ID as string,
            clientSecret: GOOGLE_CLIENT_SECRET as string,
          },
        },
      }
    : {}),

  rateLimit: {
    /*
     * Trava anti-spam nos caminhos que disparam emails ou adivinham passwords.
     * Nota para a Frente B: isto é o mínimo indispensável desta frente e vive
     * em memória (por instância). O rate limiting a sério — partilhado entre
     * instâncias — é vosso, em lib/rate-limit.ts.
     */
    enabled: true,
    customRules: {
      "/send-verification-email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },

  hooks: {
    before: enforcePasswordPolicy,
  },

  // Trata cookies em Server Actions do Next.
  plugins: [nextCookies()],
});

/**
 * O que a UI pode mostrar sem mentir. Serve os Server Components dos ecrãs de
 * auth: sem Google não desenhamos o botão, sem Resend dizemos a verdade sobre
 * o email. Só booleanos — nunca exportar chaves para o cliente.
 */
export const authCapabilities = {
  google: googleEnabled,
  email: emailEnabled,
  /** O login exige email confirmado? (acompanha o `email`) */
  emailVerificationRequired: emailEnabled,
} as const;
