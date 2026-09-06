/**
 * Converte o texto de limite usado nas configurações em MiB/s, a unidade
 * persistida em `speedLimitDownloadMbps` por compatibilidade com instalações
 * anteriores. `0` representa ilimitado e `null` representa texto incompleto
 * ou inválido que não deve alterar o último valor válido.
 */
export function parseSpeedLimitMebibytesPerSecond(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "sem limite" || normalized === "no limit") return 0;

  const match = normalized.match(/^(\d+(?:[,.]\d+)?)\s*(?:mb\/s)?$/i);
  if (!match) return null;

  const parsed = Number(match[1].replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  // Um teto impede que texto acidental ou corrompido gere um valor impossível
  // de representar com segurança na conversão posterior para bytes/s.
  return Math.min(parsed, 16_384);
}
