// Lê uma variável de ambiente obrigatória no momento de uso (não no build),
// para o build passar sem credenciais e falhar com erro claro em runtime.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente em falta: ${name}`);
  }
  return value;
}
