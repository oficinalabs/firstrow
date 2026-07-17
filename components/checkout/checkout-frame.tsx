import Image from "next/image";
import Link from "next/link";

// Moldura do checkout: 100% FirstRow, sem cor do canal nem navegação — só a
// compra (decisão do design). Vive em dark, como o resto do espectador.
export function CheckoutFrame({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-13 shrink-0 items-center justify-center bg-bar md:h-14">
        <Link href="/" aria-label="FirstRow — início">
          <Image
            src="/brand/firstrow-lockup-h-branco.svg"
            alt="FirstRow"
            width={99}
            height={24}
            priority
          />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
