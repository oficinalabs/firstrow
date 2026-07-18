# Plano v2 — Segurança, Auth, Overview e Correções

> Trabalho por **ondas orquestradas**: a Onda 1 (Frente A) faz merge primeiro; só depois
> arrancam B, C e D em paralelo. Cada frente: worktree isolado + branch + PR.
> As **boas práticas do [plano v1](PLANO-IMPLEMENTACAO-DESIGN.md)** continuam em vigor
> (DRY, tokens/variáveis — zero hex, componentes reutilizáveis, estados sempre desenhados).

## Barra de qualidade (vale para TUDO)
- **Profissionalismo em cada detalhe.** Emails sempre em **HTML** (React Email), nunca texto simples.
  O mesmo pensamento aplica-se a tudo: mensagens de erro humanas, estados de carregamento,
  acessibilidade, copy PT-PT.
- **Segurança por defeito:** validar **sempre no servidor**; nunca confiar no cliente; nunca
  expor segredos (keys, tokens, stream keys, URLs internos) a quem não é dono deles.
- **Sem erros e sem pontas soltas:** `pnpm check && pnpm typecheck && pnpm build` verdes,
  zero erros de consola, e verificação no browser antes do PR.

## Diagnóstico confirmado (2026-07-17)
- `app/admin/eventos/[id]/transmissao/page.tsx:61` e `components/admin/live-viewers.tsx:45`
  renderizam **ambos** "Sessões bloqueadas · hoje" → bloco duplicado no ecrã.
- **Não existe apagar evento** → 8 eventos "TESTE" presos, cada um com um live input órfão na Cloudflare.
- **Não existe `middleware.ts`** → proteção de rotas depende de cada página.
- `lib/admin.ts` usa `ADMIN_EMAILS` (env) como única noção de papel.
- `lib/auth.ts` mínimo: sem política de password, sem Google, sem verificação de email.

---

## ONDA 1

### Frente A — Auth & Identidade (sozinha; as outras dependem dela)
**Objetivo:** autenticação de nível profissional e um modelo de papéis a sério.

1. **Política de password:** mínimo **10 caracteres**, com maiúscula, minúscula, número e símbolo;
   rejeitar passwords óbvias/comuns. Validada **no servidor** (Better Auth) e com **checklist de
   requisitos em tempo real** no cliente (verde à medida que cumpre). Mensagens humanas.
2. **Login com Google:** `socialProviders.google` no Better Auth + botão em `/entrar` e `/registar`.
   Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redirect URI:
   `{BETTER_AUTH_URL}/api/auth/callback/google`. Tratar o caso de o email já existir com password
   (associar contas de forma segura, não duplicar utilizador).
3. **Verificação de email / ativação de conta:** `emailVerification` com envio no registo,
   `requireEmailVerification` no login por password. Email **HTML** (React Email) com o link de
   ativação; página `/verificar-email` com estados (à espera, sucesso, link expirado) e botão de
   reenviar. Sem `RESEND_API_KEY` o envio é no-op — nesse caso mostrar estado honesto, nunca
   fingir que enviou. Contas via Google entram já verificadas.
4. **Papéis (roles) na base de dados:** coluna `role` em `user` —
   `platform_admin` | `league_owner` | `league_staff` | `viewer` (default `viewer`).
   `ADMIN_EMAILS` passa a ser só **bootstrap** (promove o primeiro admin); a partir daí manda a BD.
   Criar `server/authz.ts` com helpers reutilizáveis: `requireUser()`, `requireRole(...)`,
   `isPlatformAdmin(user)`, `canManageEvents(user)`. **A Frente B vai consumir isto** — deixa a API
   clara e documentada no PR.

**Dona de:** `lib/auth.ts`, `lib/auth-client.ts`, `db/auth-schema.ts`, `db/schema.ts` (só a coluna
`role`), `app/(auth)/**`, `app/verificar-email/**`, `components/auth/**`, `emails/verificar-email.tsx`,
`lib/email.ts` (acrescentar), `server/authz.ts`, `.env.example`.
**Não toca:** `app/admin/**`, `app/page.tsx`, `components/admin/**`, `server/events.ts`, `middleware.ts`.

---

## ONDA 2 (em paralelo, depois do merge da A)

### Frente B — Autorização, blindagem de rotas e segredos
1. **`middleware.ts`**: protege `/admin/**` (não-autenticado → `/entrar?redirect=`; autenticado sem
   papel → **403 com página decente**, não um crash), e `/conta`, `/bilhetes` (autenticado).
   Defesa em profundidade: a página **também** valida (nunca só o middleware).
2. **Todas as rotas `/api/**`**: autorização no servidor, sem exceção. Em especial
   `/api/admin/*` (admin), `/api/tickets/validate` (staff/admin), `/api/tickets/*` e
   `/api/checkout/*` (dono do recurso), `/api/playback/*` (entitlement), export CSV (admin).
   Usar os helpers de `server/authz.ts` da Frente A — **não inventar gates novos**.
3. **Auditoria de segredos:** garantir que a **stream key**, tokens Cloudflare/Eupago e qualquer
   segredo **nunca** chegam ao cliente de quem não é admin (verificar respostas de API, props de
   client components e o bundle). Nada de segredos em URLs/query strings.
4. **Rate limiting** no login/registo, no mint de token de reprodução e na validação de QR.
5. **Cabeçalhos de segurança** sensatos (frame/content-type/referrer), sem partir o iframe do player.
6. Escrever **`docs/SEGURANCA-APP.md`** com a matriz de autorização (quem acede a quê) e o que foi
   verificado.

**Dona de:** `middleware.ts`, guards nas `app/api/**/route.ts`, `lib/admin.ts` (substituir por authz),
`lib/rate-limit.ts`, `docs/SEGURANCA-APP.md`. **Não toca:** UI das páginas admin (é da D), `app/page.tsx` (é da C).

### Frente C — Página inicial = visão geral (não um canal)
1. **`/` passa a ser a visão geral da plataforma**: próximas lives (de todos os canais), lista de
   canais, arquivo em destaque, e uma entrada discreta para criadores. **Não pode ser um canal.**
2. **O canal muda para `/canal/[slug]`** (ex.: `/canal/smokingbars`) com o co-branding atual;
   atualizar todos os links/navegação que apontavam para `/`.
3. Preparar para **vários canais**: `lib/tenant.ts` → `lib/channels.ts` com um array de config
   (mesmo havendo só um agora). **Sem alterações de schema** (multi-tenant em BD é fase posterior).
4. Manter o design aprovado (tokens, dark no espectador) e os estados vazio/loading/erro.

**Dona de:** `app/page.tsx`, `app/canal/**`, `components/home/**`, `lib/channels.ts` (ex-`tenant.ts`),
`components/ui/viewer-shell.tsx` (navegação). **Não toca:** `app/admin/**`, auth, api.

### Frente D — Backoffice: formulário, validação, duplicados e limpeza
1. **O form "Criar evento" não pode limpar os inputs.** Causa: React 19 **reseta o form** depois da
   action. Passar a `useActionState` (ou inputs controlados) preservando **tudo** o que foi escrito
   quando há erro de validação.
2. **Impedir duplo-submit** — foi isto que criou 8 eventos "TESTE" iguais. Desativar o botão no
   primeiro clique (antes da validação) + guarda de idempotência no servidor.
3. **Validação de data/hora:** recusar datas/horas **no passado** com aviso claro
   ("essa hora já passou — escolhe uma futura"), validado no cliente **e** no servidor.
4. **Apagar evento:** botão com confirmação; apaga também o **live input na Cloudflare** (senão ficam
   órfãos a custar dinheiro) e os dados associados. Permitir limpar os "TESTE" existentes.
   Só quem pode gerir eventos (authz da Frente A).
5. **Corrigir o bloco duplicado** "Sessões bloqueadas · hoje"
   (`transmissao/page.tsx:61` vs `live-viewers.tsx:45`) — deve aparecer **uma vez**.

**Dona de:** `components/admin/event-form.tsx`, `app/admin/eventos/**`, `components/admin/live-viewers.tsx`,
`server/events.ts`, `app/api/admin/events/**`. **Não toca:** auth, `middleware.ts`, `app/page.tsx`.

---

## Credenciais que o dono tem de obter (em paralelo com a Onda 1)
- **Google OAuth** (Google Cloud Console → APIs & Services → Credentials → OAuth client ID, tipo
  Web): `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Redirect URI autorizado:
  `https://firstrow.arestadigital.pt/api/auth/callback/google` (e `http://localhost:3000/...` para dev).
- **Resend** (para os emails de verificação): `RESEND_API_KEY` + domínio verificado
  (ex.: enviar de `no-reply@firstrow.arestadigital.pt`) → `EMAIL_FROM`.

Sem estas, o código fica pronto mas o Google e o email de ativação não funcionam em runtime.
