export function localImageUrl(externalUrl: string | null | undefined, size: "small" | "big" = "small"): string | null {
  if (!externalUrl) return null;
  const match = externalUrl.match(/\/img\/(?:small|big)\/(?:Ersatzteile)?(\d+\.jpg)/);
  if (!match) return null;
  return `/images/${size}/${match[1]}`;
}
