import Image from "next/image";

// Rodapé do espectador. Termos/Privacidade/Suporte ainda sem página própria
// (Frente F) — ficam como texto até essas rotas existirem.
export function ViewerFooter() {
  return (
    <footer className="mt-10 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 md:px-8">
        <span className="inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground">
          <Image
            src="/brand/firstrow-icon-branco.svg"
            alt=""
            width={16}
            height={16}
            className="opacity-60"
          />
          © {new Date().getFullYear()} FirstRow
        </span>
        <span className="font-mono text-2xs text-muted-foreground">
          Termos · Privacidade · Suporte
        </span>
      </div>
    </footer>
  );
}
