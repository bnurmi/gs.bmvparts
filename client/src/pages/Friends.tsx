import { Link } from "wouter";
import { useLocalizedHref } from "@/lib/locale";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ArrowRight, Wrench, Car, ShoppingCart, Cog, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackedHref } from "@/lib/tracked-link";
import { useT } from "@/lib/i18n";

const FRIENDS = [
  {
    name: "BMClips",
    url: "https://bmclips.com",
    icon: ScanSearch,
    tagline: "BMW Clip & Fastener Photo ID",
    description:
      "BMClips is an AI-powered tool for identifying BMW trim clips, push pins, Christmas trees, and trim retainers from a photo. Upload a picture of an unknown fastener and BMClips matches it against the 3.8M+ part BMV.parts database, returning candidate part numbers along with fitment details and buying options so you can order the exact replacement.",
    tags: ["Clips", "Fasteners", "Photo ID"],
    color: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800",
    iconColor: "text-rose-600 dark:text-rose-400",
  },
  {
    name: "GearSwap",
    url: "https://www.gearswap.ai",
    icon: Car,
    tagline: "AI-Powered Auto Parts Marketplace",
    description:
      "GearSwap is an AI-powered marketplace for buying and selling auto parts. It uses intelligent VIN decoding and vehicle matching to help buyers find exactly the right parts for their car. Sellers can list parts quickly with AI-assisted descriptions and automatic compatibility detection. GearSwap integrates with BMV.parts for real-time VIN decoding and vehicle identification.",
    tags: ["Marketplace", "AI", "VIN Decoding"],
    color: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    name: "BMBolts",
    url: "https://bmbolts.com",
    icon: Wrench,
    tagline: "BMW Hardware & Fastener Specialists",
    description:
      "BMBolts is a specialized supplier of BMW hardware, fasteners, and small parts that are often difficult to source. From hard-to-find bolts, clips, and screws to specialty nuts and washers, BMBolts stocks the exact OEM fasteners that BMW uses. They are an invaluable resource when you need that one specific bolt or clip to finish a repair or restoration project.",
    tags: ["Fasteners", "Hardware", "Specialist"],
    color: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    name: "8HP.shop",
    url: "https://www.8hp.shop",
    icon: Cog,
    tagline: "ZF 8HP Transmission Specialists",
    description:
      "8HP.shop is the go-to specialist for ZF 8-speed automatic transmission parts and service kits. The ZF 8HP is used across most modern BMWs, and 8HP.shop offers everything from complete service kits with fluid and filters to individual transmission components. They focus exclusively on the 8HP platform, making them experts in this critical drivetrain component.",
    tags: ["Transmission", "ZF 8HP", "Specialist"],
    color: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    name: "MPerformance.parts",
    url: "https://www.mperformance.parts",
    icon: ShoppingCart,
    tagline: "BMW M Performance Parts & Accessories",
    description:
      "MPerformance.parts specializes in BMW M Performance parts and accessories. From carbon fiber aero kits and exhaust systems to suspension upgrades and interior trim, they carry the full range of official BMW M Performance catalog items. They offer competitive pricing and ship worldwide, with a focus on making genuine M Performance upgrades accessible to all BMW enthusiasts.",
    tags: ["M Performance", "Accessories", "Upgrades"],
    color: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    iconColor: "text-green-600 dark:text-green-400",
  },
];

export default function Friends() {
  const localize = useLocalizedHref();
  const t = useT();
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8" data-testid="page-friends">
      <SEO
        title="BMW Parts Resources & Recommended Sites"
        description="Discover the best BMW parts resources, suppliers, and tools recommended by BMV.parts. From OEM parts retailers to AI-powered marketplaces and transmission specialists."
        path="/recommended-sites"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Recommended Sites", url: "/recommended-sites" },
        ]}
      />

      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-friends-heading">
          {t.friends.heading}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {t.friends.intro}
        </p>
      </section>

      <section className="space-y-5">
        {FRIENDS.map((friend) => {
          const Icon = friend.icon;
          return (
            <Card
              key={friend.name}
              className={`overflow-hidden border ${friend.color}`}
              data-testid={`card-friend-${friend.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
            >
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg bg-background border flex items-center justify-center shrink-0 ${friend.iconColor}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold">{friend.name}</h2>
                      <div className="flex gap-1.5 flex-wrap">
                        {friend.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">{friend.tagline}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{friend.description}</p>
                    <a
                      href={trackedHref(friend.url, { label: friend.name, source: "friends" })}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`link-friend-${friend.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                    >
                      <Button variant="outline" size="sm" className="mt-2 gap-1.5">
                        {t.friends.visitX(friend.name)}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3 pb-8">
        <h2 className="text-xl font-semibold tracking-tight">{t.friends.lookingForPartsHeading}</h2>
        <p className="text-muted-foreground text-sm">
          {t.friends.lookingForPartsBody}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={localize("/")}>
            <Button data-testid="button-browse-catalog">
              {t.about.browseCatalog} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Link href={localize("/search")}>
            <Button variant="outline" data-testid="button-search-parts">
              {t.about.searchPartsBtn}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
