// Top-level Quick Servicing Info page (Task #106). Routes:
//   /servicing          — empty state with VIN lookup form
//   /servicing/:vin     — resolved view for a specific VIN
// The actual rendering is delegated to <ServicingBody/> so the same UI
// powers the Servicing tab on the VIN Decoder page.

import { useRoute, useLocation } from "wouter";
import { SEO } from "@/components/SEO";
import { useLocalizedHref } from "@/lib/locale";
import { useT, EN } from "@/lib/i18n";
import ServicingBody from "@/components/ServicingBody";

export default function Servicing() {
  const [, paramsWithVin] = useRoute("/servicing/:vin");
  const [, paramsWithLocale] = useRoute("/:locale/servicing/:vin");
  const [, navigate] = useLocation();
  const localize = useLocalizedHref();
  const t = useT();
  const s = t.servicing ?? EN.servicing!;
  const vin = paramsWithVin?.vin || paramsWithLocale?.vin || null;

  const seoPath = vin ? `/servicing/${vin}` : "/servicing";
  const seoTitle = vin
    ? `${s.title} — ${vin}`
    : `${s.title} — BMW`;
  const seoDescription = vin
    ? `${s.subtitle} VIN ${vin}.`
    : s.subtitle;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <SEO title={seoTitle} description={seoDescription} path={seoPath} />
      <ServicingBody
        vin={vin}
        onVinSubmit={(v) => navigate(localize(`/servicing/${v}`))}
      />
    </div>
  );
}
