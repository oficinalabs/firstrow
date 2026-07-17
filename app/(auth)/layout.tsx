/*
 * Auth vive em papel (tema light da fundação): coluna única, centrada, com a
 * marca no topo do cartão. Ver design/FirstRow Plataforma/Espectador.dc.html
 * (#auth-entrar, #auth-recuperar).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      {children}
    </main>
  );
}
