/*
 * Substituto de `server-only` nos testes (ver o alias em `vitest.config.ts`).
 *
 * O pacote real não tem código nenhum: é um marcador que o Next resolve para
 * um módulo que rebenta o build quando um ficheiro de servidor entra no bundle
 * do cliente. Fora do Next não existe — e sem este ficheiro qualquer teste que
 * importe `lib/eupago.ts` ou `server/channel-members.ts` falhava no import.
 */
export {};
