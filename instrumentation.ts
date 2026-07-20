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

  const { reportStartupConfig, reportStreamSubscription } = await import("@/lib/startup-check");
  reportStartupConfig();

  /*
   * A subscrição da Cloudflare pergunta-se pela rede, e o arranque não espera
   * por ela: um relatório não tem o direito de atrasar o primeiro pedido, nem
   * de partir o arranque se a Cloudflare estiver em baixo. Sai no log poucos
   * segundos depois, que é quando alguém o vai ler.
   */
  void reportStreamSubscription().catch((error) => {
    console.warn("[stream] verificação de subscrição falhou:", error);
  });
}
