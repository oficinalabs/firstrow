"use client";

import { TriangleAlert } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { removeMemberAction, setMemberAction } from "@/app/admin/canais/actions";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ChannelRole } from "@/db/schema";
import type { MemberRow } from "@/server/channel-members";

/*
 * Quem manda num canal: ver, convidar, mudar de papel e retirar.
 *
 * As escritas estão todas em `server/channel-members.ts` e as recusas vêm
 * redigidas de lá (`memberChangeMessage`). Este ficheiro não sabe o que é um
 * "último dono" — mostra o que o servidor responder. É de propósito: o
 * invariante mora ao pé da transação que o segura, não ao pé de um botão.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE TODAS AS MUDANÇAS DE PAPEL PEDEM CONFIRMAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Despromover é o caso óbvio: tira acesso. Promover a dono parece inofensivo e
 * é o mais caro dos dois — dá a alguém os eventos, os COMPRADORES e o DINHEIRO
 * da liga, e o poder de retirar do canal quem o promoveu. Um clique sem rede
 * numa tabela com várias linhas parecidas é como se dá isso à pessoa errada.
 *
 * Por isso não há `<select>` de papel nas linhas: cada mudança é um botão com
 * nome próprio ("Tornar dono", "Passar a equipa") e o diálogo diz o que vai
 * acontecer ANTES de acontecer.
 *
 * UM DIÁLOGO SÓ, e não um por linha: o que está a acontecer é sempre uma coisa
 * de cada vez, e n diálogos no DOM era n vezes o mesmo <dialog> à espera.
 */

/**
 * O que cada papel abre, em palavras de quem convida.
 *
 * `Record<ChannelRole, …>` e não uma lista solta: no dia em que
 * `CHANNEL_ROLES` ganhar um terceiro papel, isto deixa de compilar em vez de
 * ficar em silêncio a mostrar um papel sem nome.
 */
const ROLE_INFO: Record<ChannelRole, { label: string; hint: string }> = {
  owner: { label: "Dono", hint: "Gere os eventos, o dinheiro e os membros deste canal." },
  staff: { label: "Equipa", hint: "Opera a transmissão e valida bilhetes à porta." },
};

/** Os papéis pela ordem em que se oferecem. Chaves de texto mantêm a inserção. */
const ROLES = Object.keys(ROLE_INFO) as ChannelRole[];

/** O papel para onde um botão de mudança leva — só há dois, um é o outro. */
function otherRole(role: ChannelRole): ChannelRole {
  return role === "owner" ? "staff" : "owner";
}

/** A ação à espera de confirmação. `null` = nenhum diálogo aberto. */
type PendingAction =
  | { kind: "role"; member: MemberRow; role: ChannelRole }
  | { kind: "remove"; member: MemberRow };

export type ChannelMembersProps = {
  channelId: string;
  channelName: string;
  members: MemberRow[];
  /** Quem está a ver — para o diálogo poder dizer "és tu". */
  viewerId: string;
};

export function ChannelMembers({ channelId, channelName, members, viewerId }: ChannelMembersProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [running, startAction] = useTransition();

  const owners = members.filter((member) => member.role === "owner").length;

  function run(action: PendingAction) {
    if (running) return;
    setActionError("");
    startAction(async () => {
      const result =
        action.kind === "remove"
          ? await removeMemberAction(channelId, action.member.userId)
          : await setMemberAction(channelId, action.member.email, action.role);

      // A recusa fica no diálogo, ao pé do botão que a provocou — fechá-lo
      // mandava a pessoa procurar a explicação noutro sítio do ecrã.
      if (result.error) setActionError(result.error);
      else setPendingAction(null);
    });
  }

  return (
    <>
      {owners === 0 ? <NoOwnerNotice /> : null}

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle>Quem manda neste canal</CardTitle>
          <span className="font-mono text-2xs text-muted-foreground">
            {owners === 1 ? "1 dono" : `${owners} donos`}
          </span>
        </CardHeader>
        <CardContent>
          <DataTable<MemberRow>
            columns={[
              {
                header: "Pessoa",
                destaque: true,
                cell: (member) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {member.name}
                      {member.userId === viewerId ? (
                        <span className="ml-1.5 font-normal text-muted-foreground">(és tu)</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{member.email}</span>
                  </span>
                ),
              },
              {
                header: "Papel",
                // Etiqueta com PALAVRA, não com cor: quem não distingue cores
                // tem de saber na mesma quem é dono.
                cell: (member) => <Badge>{ROLE_INFO[member.role].label}</Badge>,
              },
              {
                header: "",
                accoes: true,
                numeric: true,
                cell: (member) => (
                  <span className="flex items-center justify-end gap-3.5">
                    <RowAction
                      label={member.role === "owner" ? "Passar a equipa" : "Tornar dono"}
                      name={member.name}
                      disabled={running}
                      onClick={() => {
                        setActionError("");
                        setPendingAction({
                          kind: "role",
                          member,
                          role: otherRole(member.role),
                        });
                      }}
                    />
                    <RowAction
                      label="Retirar"
                      name={member.name}
                      destructive
                      disabled={running}
                      onClick={() => {
                        setActionError("");
                        setPendingAction({ kind: "remove", member });
                      }}
                    />
                  </span>
                ),
              },
            ]}
            rows={members}
            rowKey={(member) => member.userId}
            empty={
              <p className="py-4 text-2sm text-muted-foreground">
                Ninguém tem papel neste canal. Só a FirstRow o consegue gerir enquanto assim for.
              </p>
            }
          />
        </CardContent>
      </Card>

      <InviteCard channelId={channelId} />

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction ? dialogTitle(pendingAction, channelName) : ""}
        confirmLabel={pendingAction ? confirmLabel(pendingAction) : ""}
        pendingLabel={pendingAction ? pendingLabel(pendingAction) : ""}
        destructive={pendingAction ? isDestructive(pendingAction) : false}
        pending={running}
        error={actionError}
        onConfirm={() => pendingAction && run(pendingAction)}
        onDismiss={() => {
          // Sem isto, o erro da tentativa anterior reaparecia na próxima
          // abertura do diálogo, a falar de uma pessoa que já não é aquela.
          if (running) return;
          setPendingAction(null);
          setActionError("");
        }}
      >
        {pendingAction ? (
          <DialogBody action={pendingAction} channelName={channelName} viewerId={viewerId} />
        ) : null}
      </ConfirmDialog>
    </>
  );
}

// ── Uma ação numa linha da tabela ───────────────────────────────────────────

/**
 * As linhas repetem os mesmos botões, e sem o nome da pessoa no rótulo
 * acessível um leitor de ecrã anunciava "Retirar, Retirar, Retirar" sem dizer
 * de quem. O texto visível continua curto — a tabela é larga que baste.
 */
function RowAction({
  label,
  name,
  destructive = false,
  disabled,
  onClick,
}: {
  label: string;
  name: string;
  destructive?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} — ${name}`}
      className={
        destructive
          ? "cursor-pointer font-sans text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline disabled:pointer-events-none disabled:opacity-50"
          : "cursor-pointer font-sans text-xs font-semibold text-foreground underline-offset-4 transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}

// ── O aviso de canal sem dono ───────────────────────────────────────────────

/**
 * Um canal recém-criado não tem dono, e isso é legítimo (ver ADR-011: inventar
 * um dono era dar acesso a quem não o pediu). Mas é um estado de passagem — o
 * canal só está entregue quando a liga lá estiver.
 */
function NoOwnerNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-sm border border-warning/50 bg-warning/10 p-3">
      <span aria-hidden className="mt-0.5 text-warning">
        <TriangleAlert className="size-4" strokeWidth={2.5} />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-2sm font-semibold">Este canal ainda não tem dono</p>
        <p className="text-xs leading-relaxed text-foreground-secondary">
          Por agora só a FirstRow o consegue gerir. Junta como <strong>dono</strong> a conta de quem
          vai tratar da liga — é isso que lhe entrega os eventos e o dinheiro do canal.
        </p>
      </div>
    </div>
  );
}

// ── Convidar ────────────────────────────────────────────────────────────────

/**
 * Juntar alguém ao canal.
 *
 * As três garantias de sempre (ver `channel-form.tsx` — foi de um formulário
 * sem elas que nasceram 16 eventos duplicados): o erro nunca leva à frente o
 * que foi escrito, cala-se assim que se mexe no campo, e o botão desativa ao
 * primeiro clique. O email só se limpa quando a escrita corre bem.
 */
function InviteCard({ channelId }: { channelId: string }) {
  const emailId = useId();
  const roleId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ChannelRole>("staff");
  const [error, setError] = useState("");
  const [inviting, startInvite] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // O `disabled` é a primeira barreira; esta aguenta um Enter repetido antes
    // de o re-render chegar.
    if (inviting) return;
    setError("");

    startInvite(async () => {
      const result = await setMemberAction(channelId, email, role);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Só agora: enquanto houver erro, o que foi escrito fica onde estava.
      setEmail("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Juntar alguém ao canal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid items-start gap-4 md:grid-cols-[1fr_12rem_auto]">
            <Field>
              <FieldLabel htmlFor={emailId}>Email da conta</FieldLabel>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  // A queixa cala-se ao mexer no campo; volta na submissão
                  // seguinte, se ainda fizer sentido.
                  if (error) setError("");
                }}
                placeholder="pessoa@exemplo.pt"
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                // O erro fica por baixo da linha toda (é dela que fala), por
                // isso a ligação tem de ser explícita: o `role="alert"` anuncia
                // quando aparece, isto faz com que quem voltar ao campo o ouça
                // outra vez em vez de encontrar uma borda vermelha sem razão.
                aria-describedby={error ? errorId : undefined}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={roleId}>Papel</FieldLabel>
              <Select
                id={roleId}
                value={role}
                onChange={(event) => setRole(event.target.value as ChannelRole)}
              >
                {ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_INFO[value].label}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Alinha com os campos, que têm rótulo por cima. */}
            <Button type="submit" size="lg" disabled={inviting} className="md:mt-6.5">
              {inviting ? "A juntar…" : "Juntar ao canal"}
            </Button>
          </div>

          <FieldError id={errorId}>{error}</FieldError>
          <FieldHint>
            {ROLE_INFO[role].hint} A conta já tem de existir na FirstRow — isto dá papel a quem já
            se registou, não envia convites. Se já for membro, o papel é substituído.
          </FieldHint>
        </form>
      </CardContent>
    </Card>
  );
}

// ── O que o diálogo diz em cada caso ────────────────────────────────────────

function dialogTitle(action: PendingAction, channelName: string): string {
  if (action.kind === "remove") return `Retirar ${action.member.name} do canal?`;
  return action.role === "owner"
    ? `Tornar ${action.member.name} dono de ${channelName}?`
    : `Passar ${action.member.name} a equipa?`;
}

function confirmLabel(action: PendingAction): string {
  if (action.kind === "remove") return "Retirar do canal";
  return action.role === "owner" ? "Tornar dono" : "Passar a equipa";
}

function pendingLabel(action: PendingAction): string {
  if (action.kind === "remove") return "A retirar…";
  return action.role === "owner" ? "A promover…" : "A mudar…";
}

/** Vermelho para o que RETIRA acesso. Promover a dono não é destrutivo. */
function isDestructive(action: PendingAction): boolean {
  return action.kind === "remove" || action.role === "staff";
}

function DialogBody({
  action,
  channelName,
  viewerId,
}: {
  action: PendingAction;
  channelName: string;
  viewerId: string;
}) {
  const isSelf = action.member.userId === viewerId;

  if (action.kind === "remove") {
    return (
      <>
        <p>
          {action.member.name} deixa de{" "}
          {action.member.role === "owner"
            ? "ver os eventos, o dinheiro e os compradores"
            : "operar a transmissão e de validar bilhetes"}{" "}
          de <strong className="text-foreground">{channelName}</strong>.
        </p>
        <p>A conta continua a existir, e o que essa pessoa comprou não se perde.</p>
        {isSelf ? (
          <p className="text-foreground">
            És tu. Perdes o acesso a este canal e só outro dono to pode devolver.
          </p>
        ) : null}
      </>
    );
  }

  if (action.role === "owner") {
    return (
      <>
        <p>
          Passa a gerir os eventos, o dinheiro e os compradores de{" "}
          <strong className="text-foreground">{channelName}</strong>.
        </p>
        <p>Também pode juntar e retirar membros — incluindo quem o tornou dono.</p>
      </>
    );
  }

  return (
    <>
      <p>
        {action.member.name} deixa de gerir os eventos e o dinheiro de{" "}
        <strong className="text-foreground">{channelName}</strong>.
      </p>
      <p>Continua na equipa: opera a transmissão e valida bilhetes à porta.</p>
      {isSelf ? (
        <p className="text-foreground">
          És tu. Deixas de poder gerir este canal e só outro dono to pode devolver.
        </p>
      ) : null}
    </>
  );
}
