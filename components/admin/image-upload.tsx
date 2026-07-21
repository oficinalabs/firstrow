"use client";

import { AlertCircle, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  checkImage,
  detectImageFormat,
  formatBytes,
  IMAGE_ACCEPT,
  IMAGE_RULES,
  type ImageKind,
  looksLikeSvg,
  SVG_REFUSAL,
} from "@/components/admin/image-upload-rules";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/*
 * ============================================================================
 *  CARREGAR UMA IMAGEM DE CANAL
 * ============================================================================
 *
 * **Um componente, não dois.** O logo e o banner só diferem em números e na
 * forma da moldura — e os números vivem todos em `image-upload-rules.ts`. Dois
 * componentes quase iguais é como um deles fica para trás no dia em que a
 * regra mudar.
 *
 * QUATRO COISAS QUE ESTE PRODUTO JÁ PAGOU PARA APRENDER
 *
 *  1. **As medidas dizem-se ANTES do erro.** A dica está sempre no ecrã, não
 *     aparece depois de alguém falhar. Um erro que ensina uma regra que podia
 *     ter sido dita antes é um erro que não devia ter acontecido.
 *  2. **Um erro nunca limpa o resto.** Este componente não toca no valor
 *     gravado quando a coisa corre mal: o `onChange` só é chamado com sucesso.
 *     Foi de formulários sem esta garantia que nasceram 16 eventos duplicados.
 *  3. **Pré-visualização antes de gravar.** Vê-se a imagem escolhida na forma
 *     em que vai aparecer — quadrada no logo, faixa no banner —, e não um nome
 *     de ficheiro.
 *  4. **O botão nunca fica mudo.** Num telemóvel com dados contados, 3 MB
 *     demoram. Há percentagem a subir, o botão diz o que está a fazer, e há um
 *     `aria-live` para quem não vê a barra.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUÊ XMLHttpRequest E NÃO fetch
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O `fetch` não sabe dizer quanto do CORPO já subiu — o `ReadableStream` de
 * pedido ainda não é utilizável em todos os browsers que temos de servir, e sem
 * ele o único sinal é "acabou". O XHR tem `upload.onprogress` desde sempre.
 * Trocamos elegância por uma barra que se mexe, que é o que a pessoa quer ver.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A VALIDAÇÃO DO BROWSER É CONFORTO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Mede-se aqui para responder na hora e para não fazer subir 3 MB por dados
 * móveis só para o servidor dizer que o rácio está errado. Mas quem recusa a
 * sério é `app/api/uploads/canal/route.ts` — que corre EXACTAMENTE as mesmas
 * funções (`detectImageFormat`, `checkImage`) sobre os bytes que chegaram.
 */

export type ImageUploadProps = {
  kind: ImageKind;
  /** URL atual, ou "" quando não há imagem. */
  value: string;
  /** Chamado só quando há um URL novo (ou "" ao remover). Nunca em erro. */
  onChange: (url: string) => void;
  /** O canal a que a imagem pertence. Vazio no ecrã de criar — ver a rota. */
  channelId?: string;
  /**
   * Queixa vinda do formulário (validação do servidor ao gravar o canal). Vive
   * na mesma linha que a queixa do upload de propósito: dois sítios a mostrar
   * erros do mesmo campo é como a pessoa lê um e não vê o outro.
   */
  error?: string;
  disabled?: boolean;
};

type Status = "idle" | "uploading";

const ENDPOINT = "/api/uploads/canal";

/**
 * Mede a imagem no browser sem a fazer subir. `null` quando o browser não
 * consegue — nesse caso é o servidor que responde, como sempre.
 */
async function measure(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    // Sem isto, a imagem descodificada fica em memória até o GC se lembrar dela.
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export function ImageUpload({
  kind,
  value,
  onChange,
  channelId,
  error: formError,
  disabled,
}: ImageUploadProps) {
  const rules = IMAGE_RULES[kind];
  const inputId = useId();
  const hintId = `${inputId}-dica`;
  const errorId = `${inputId}-erro`;

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  // A do upload ganha: é a mais recente, e é sobre o que a pessoa acabou de fazer.
  const error = uploadError || (formError ?? "");
  /** Pré-visualização local (blob:) enquanto sobe. Fica `null` depois. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const localPreviewRef = useRef<string | null>(null);

  // Um `blob:` é uma referência viva: sem `revoke`, os bytes ficam presos ao
  // separador enquanto ele estiver aberto.
  function setPreview(url: string | null) {
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    localPreviewRef.current = url;
    setLocalPreview(url);
  }

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
      xhrRef.current?.abort();
    };
  }, []);

  const shown = localPreview ?? (value || null);

  function fail(message: string) {
    setUploadError(message);
    setStatus("idle");
    setProgress(0);
    setPreview(null);
    // O input é reposto para que escolher OUTRA VEZ o mesmo ficheiro (depois de
    // o corrigir no disco) volte a disparar o `change`.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setUploadError("");

    if (file.size > rules.maxBytes) {
      fail(
        `A imagem tem ${formatBytes(file.size)} e o limite é ${formatBytes(rules.maxBytes)}. Guarda-a com menos qualidade ou mais pequena.`,
      );
      return;
    }

    // O tipo real pelos primeiros bytes — a mesma função que o servidor corre.
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!detectImageFormat(head)) {
      const sample = new Uint8Array(await file.slice(0, 512).arrayBuffer());
      fail(looksLikeSvg(sample) ? SVG_REFUSAL : "Isto não é uma imagem PNG, JPG ou WebP.");
      return;
    }

    const size = await measure(file);
    if (size) {
      const complaint = checkImage(kind, { ...size, bytes: file.size });
      if (complaint) {
        fail(complaint);
        return;
      }
    }

    setPreview(URL.createObjectURL(file));
    setStatus("uploading");
    setProgress(0);

    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    if (channelId) body.set("channelId", channelId);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", ENDPOINT);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      xhrRef.current = null;
      const payload = xhr.response as { url?: string; error?: string } | null;

      if (xhr.status === 201 && payload?.url) {
        setStatus("idle");
        setProgress(0);
        // A pré-visualização local só se larga DEPOIS de o URL novo estar no
        // formulário: largá-la antes dava um piscar de moldura vazia.
        onChange(payload.url);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      fail(payload?.error ?? "Não conseguimos guardar a imagem. Tenta outra vez daqui a pouco.");
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      fail("A ligação falhou a meio do envio. Tenta outra vez.");
    };
    xhr.onabort = () => {
      xhrRef.current = null;
    };

    xhr.send(body);
  }

  function remove() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setStatus("idle");
    setProgress(0);
    setUploadError("");
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    onChange("");
  }

  const busy = status === "uploading";
  const blocked = disabled || busy;

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{rules.label}</FieldLabel>
      {/* A dica está SEMPRE cá, e não só depois de alguém falhar. */}
      <FieldHint id={hintId}>
        {rules.expected} {rules.purpose}
      </FieldHint>

      <div className="mt-0.5 flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Moldura na forma real: quadrada no logo, faixa 3:1 no banner. */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-sm border border-input bg-muted",
            kind === "logo" ? "size-20" : "aspect-[3/1] w-full sm:w-52",
          )}
        >
          {shown ? (
            // <img> e não next/image: a pré-visualização local é um `blob:`, que
            // o optimizador não sabe servir. É uma moldura de 80 a 208 px num
            // ecrã de gestão — não há nada a optimizar.
            // biome-ignore lint/performance/noImgElement: `blob:` não passa pelo next/image
            <img
              src={shown}
              alt=""
              className={cn(
                "size-full",
                // O logo mostra-se inteiro (pode ter margem); o banner enche.
                kind === "logo" ? "object-contain" : "object-cover",
                busy && "opacity-60",
              )}
            />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <ImagePlus className="size-5" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/*
             * Input nativo escondido mas FOCÁVEL (`sr-only`, não `hidden`): o
             * Tab chega-lhe, o Enter abre o seletor. O anel de foco é desenhado
             * pela etiqueta com `peer-focus-visible` — mesmo padrão do
             * `brand-color-picker.tsx`.
             *
             * ⚠️ O `aria-label` NÃO é decoração. Este input tem DUAS etiquetas a
             * apontar-lhe (a do campo, "Logo", e a do botão, "Substituir"), e
             * medido no browser o nome anunciado saía "Logo Substituir" — a
             * soma das duas, por acidente. Com `aria-label` o nome passa a ser
             * escolhido, não somado. As etiquetas ficam: são elas que fazem o
             * clique abrir o seletor.
             */}
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={blocked}
              aria-label={`${rules.label} — ${shown ? "substituir imagem" : "escolher imagem"}`}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              aria-invalid={error ? true : undefined}
              className="peer sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <label
              htmlFor={inputId}
              className={cn(
                "inline-flex h-11 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-input px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2",
                blocked && "pointer-events-none border-transparent bg-muted text-muted-foreground",
              )}
            >
              <ImagePlus className="size-4" aria-hidden />
              {busy ? `A enviar… ${progress}%` : shown ? "Substituir" : "Escolher imagem"}
            </label>

            {shown ? (
              <Button
                variant="ghost"
                onClick={remove}
                disabled={disabled}
                className="h-11 px-3"
                // O ícone sozinho não chega a quem não vê: o nome do botão diz
                // de que imagem se trata.
                aria-label={busy ? `Cancelar envio do ${rules.label}` : `Remover ${rules.label}`}
              >
                <Trash2 className="size-4" aria-hidden />
                <span>{busy ? "Cancelar" : "Remover"}</span>
              </Button>
            ) : null}
          </div>

          {/*
           * A barra é `aria-hidden` e o estado vai em texto ao lado: uma barra
           * anunciada a cada percentagem é ruído, e quem não a vê precisa de
           * saber que arrancou e que acabou, não de 100 números.
           */}
          {busy ? (
            <div
              aria-hidden
              className="h-1 w-full overflow-hidden rounded-full bg-muted sm:max-w-64"
            >
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}

          <span role="status" aria-live="polite" className="sr-only">
            {busy ? `A enviar ${rules.label}, ${progress} por cento.` : ""}
          </span>

          {/*
           * O erro não é só cor: leva ícone e `role="alert"` (dentro do
           * FieldError). Quem tem daltonismo, ou quem lê por voz, recebe-o na
           * mesma.
           */}
          {error ? (
            <FieldError id={errorId} className="flex items-start gap-1.5">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{error}</span>
            </FieldError>
          ) : null}
        </div>
      </div>
    </Field>
  );
}
