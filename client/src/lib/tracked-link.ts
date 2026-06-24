export function trackedHref(
  url: string,
  opts?: { label?: string; partNumber?: string; source?: string }
): string {
  const params = new URLSearchParams();
  params.set("url", url);
  if (opts?.label) params.set("label", opts.label);
  if (opts?.partNumber) params.set("pn", opts.partNumber);
  if (opts?.source) params.set("src", opts.source);
  return `/go?${params.toString()}`;
}
