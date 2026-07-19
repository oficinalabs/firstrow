import "server-only";

/*
 * `server-only` é um alarme em tempo de BUILD: se algum dia um componente com
 * "use client" importar este ficheiro (direta ou indiretamente), o build parte
 * com um erro que aponta ao import culpado. É o que transforma "auditámos e
 * não havia segredos no bundle" numa garantia contínua em vez de uma foto de
 * um dia — a auditoria não deteta o que ainda não foi escrito.
 *
 * Não é preciso instalar nada: o Next resolve `server-only` internamente.
 */

// Lê uma variável de ambiente obrigatória no momento de uso (não no build),
// para o build passar sem credenciais e falhar com erro claro em runtime.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente em falta: ${name}`);
  }
  return value;
}
