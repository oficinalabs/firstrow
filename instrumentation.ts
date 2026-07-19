/*
 * Corre uma vez por arranque do servidor, antes de servir o primeiro pedido.
 *
 * Serve só para dizer em voz alta o que ficou por configurar — ver
 * lib/startup-check.ts para o porquê. Nada aqui deve ter efeitos: se um dia
 * este ficheiro fizer mais do que relatar, deixa de poder falhar em silêncio.
 */
export async function register() {
  // O `instrumentation` também corre no runtime edge, onde não há nada disto
  // para verificar e o relatório sairia duplicado a cada região.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reportStartupConfig } = await import("@/lib/startup-check");
  reportStartupConfig();
}
