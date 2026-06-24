// Authored translations for the bmv.vin SSR page-chrome strings
// (VinHostStrings). One object per non-English locale; attached to the
// matching LocalePack at module load so getVinHostStrings() returns
// authored copy for every supported locale (no English fallback).
//
// Brand nouns (BMW, MINI, ALPINA, Rolls-Royce, BMW Motorrad) and the
// technical acronyms (VIN/WMI/VDS/VIS, SA, OEM) stay untranslated; only
// surrounding descriptive text is localised. German uses "FIN" for VIN
// per industry convention. Task #98.

import type { VinHostStrings } from "./types";
import { enVinHost } from "./vin-host";
import { deDEPack } from "./de-DE";
import { frFRPack } from "./fr-FR";
import { esESPack } from "./es-ES";
import { itITPack } from "./it-IT";
import { zhCNPack } from "./zh-CN";
import { koKRPack } from "./ko-KR";
import { esMXPack } from "./es-MX";
import { enZAPack } from "./en-ZA";
import { ptBRPack } from "./pt-BR";
import { ruRUPack } from "./ru-RU";

const COMMON_BRAND = {
  bmw: "BMW", mini: "MINI", alpina: "ALPINA",
  rollsRoyce: "Rolls-Royce", motorrad: "BMW Motorrad",
};

// =============================================================================
// de-DE (German — uses "FIN" for VIN)
// =============================================================================
export const deDEVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "Karosserie", year: "Modelljahr", plant: "Werk",
    market: "Markt", paint: "Lackierung", option: "Werksausstattung",
  },
  homeMetaTitle: "BMV.VIN — Kostenloser BMW FIN-Decoder & FIN-Abfrage",
  homeMetaDescription:
    "FIN von BMW, MINI, ALPINA, Rolls-Royce oder BMW Motorrad entschlüsseln. Werksausstattung, Lackierung, Werk, Baudatum und OEM-Teile abrufen — kostenlos, sofort, ohne Anmeldung.",
  homeH1: "Kostenloser BMW FIN-Decoder",
  homeIntro:
    "Geben Sie eine 17-stellige FIN ein, um Modell, Karosserie, Motor, Lackierung, Werksausstattung, Baudatum und Werk zu entschlüsseln. Wir unterstützen alle Marken der BMW Group: BMW, MINI, ALPINA, Rolls-Royce und BMW Motorrad.",
  homeBrandsHeading: "Nach Marke entschlüsseln",
  homeFacetsHeading: "Nach Karosserie, Jahr, Werk, Markt, Lack oder Ausstattung",
  homeGuidesHeading: "FIN-Anleitungen",
  homeGlossaryHeading: "FIN-Glossar",
  brandHubMetaTitle: brand => `${brand} FIN-Decoder — kostenlose ${brand}-FIN-Abfrage | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `${brand}-FIN entschlüsseln: Modell, Karosserie, Motor, Lackierung, Werksausstattung, Baudatum und Werk. Verlinkung zu OEM-Teilen auf bmv.parts.`,
  brandHubH1: brand => `${brand} FIN-Decoder`,
  brandHubIntro: brand =>
    `Geben Sie eine ${brand}-FIN ein, um den Werksdatensatz abzurufen. Wir entschlüsseln WMI/VDS/VIS, Modellcode, Modelljahrbuchstabe, Werk, Ausstattung und Lackierung.`,
  brandHubWmiHeading: "Herstellercodes (WMI)",
  brandHubRelatedHeading: "Verwandte Decoder",
  facetIndexMetaTitle: kind => `BMW-FINs nach ${kind} durchsuchen | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Entschlüsselte BMW-FINs nach ${kind} gruppiert durchsuchen. Jeder Hub listet Beispiel-FINs und verlinkt auf OEM-Teile.`,
  facetIndexH1: kind => `Nach ${kind} durchsuchen`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — FIN-Beispiele & OEM-Teile | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} entschlüsselte BMW-FINs für ${kind} ${value}. Beispiel-FINs ansehen, Werksausstattung prüfen und OEM-Teile auf bmv.parts kaufen.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} Beispiel-FIN${n === 1 ? "" : "s"}`,
  facetHubEmpty: "Noch keine entschlüsselten FINs in dieser Gruppe — versuchen Sie es mit dem Formular oben.",
  guideIndexMetaTitle: "BMW-FIN-Anleitungen — wie FINs funktionieren | BMV.VIN",
  guideIndexMetaDescription:
    "Verständliche Anleitungen zur BMW-FIN-Entschlüsselung: WMI/VDS/VIS, Prüfziffer, Modelljahrbuchstabe, Werkscodes, Lackierung, SA-/Optionscodes und mehr.",
  guideIndexH1: "BMW-FIN-Anleitungen",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "Verwandte Anleitungen",
  glossaryIndexMetaTitle: "BMW-FIN-Glossar — Begriffe, Codes & Abkürzungen | BMV.VIN",
  glossaryIndexMetaDescription:
    "Definitionen aller Begriffe rund um die BMW-FIN: WMI, VDS, VIS, Prüfziffer, Modelljahrbuchstabe, SA-Codes, Lackcodes, Werkscodes.",
  glossaryIndexH1: "BMW-FIN-Glossar",
  glossaryMetaTitle: term => `${term} — BMW-FIN-Glossar | BMV.VIN`,
  glossaryRelatedHeading: "Verwandte Begriffe",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "Weitere FIN entschlüsseln",
  shopOemPartsCta: "OEM-Teile auf bmv.parts kaufen",
  vinInputLabel: "FIN (17 Zeichen)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Entschlüsseln",
  faqHeading: "Häufig gestellte Fragen",
  notFoundH1: "Seite nicht gefunden",
  notFoundBody: "Diese Seite existiert nicht. Versuchen Sie die Decoder-Startseite oder durchsuchen Sie nach Karosserie, Jahr oder Werk.",
  homeRecentlyDecodedHeading: "Zuletzt entschlüsselte FINs",
  brandRecentlyDecodedHeading: brand => `Zuletzt entschlüsselte ${brand}-FINs`,
  brandTopChassisHeading: brand => `Top ${brand}-Karosserien`,
  homeHowToTitle: "So entschlüsseln Sie eine BMW-FIN",
  homeHowToDescription:
    "Schritt für Schritt: Geben Sie die 17-stellige FIN ein, lesen Sie Karosserie/Motor/Ausstattung und springen Sie zu OEM-Teilen.",
  homeHowToSteps: [
    {
      name: "Die 17-stellige FIN finden",
      text: "Suchen Sie an der unteren Windschutzscheibe, am Türholm der Fahrerseite oder in den Fahrzeugpapieren. I, O und Q kommen nicht vor — BMW-FINs nutzen 0–9 und A–Z ohne diese drei.",
    },
    {
      name: "FIN in den Decoder einfügen",
      text: "Verwenden Sie den Decoder oben. Die Marke wird anhand des WMI (erste drei Zeichen) erkannt und die Abfrage automatisch geroutet.",
    },
    {
      name: "Den entschlüsselten Werksdatensatz lesen",
      text: "Wir zeigen Karosserie, Modelljahr, Motor, Lackierung, Werk, Werksausstattung (SA-Codes) und passende Bordbücher. Jeder Tab trägt ein Quellenkennzeichen, sodass klar ist, ob die Antwort aus erstanbieterlichen BMW-Daten oder einem Fallback-Decoder stammt.",
    },
    {
      name: "Passende OEM-Teile durchsuchen",
      text: "Klicken Sie auf \u201eOEM-Teile kaufen\u201c, um zum bmv.parts-Katalog zu springen, gefiltert auf genau diese Karosserie.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `Seite ${page} von ${total}`,
  facetPaginationPrev: "← Zurück",
  facetPaginationNext: "Weiter →",
  facetCrossRailHeading: kind => `Andere ${kind}-Werte in dieser Gruppe`,
  facetThinCohortNote: cohort =>
    `Nur ${cohort} entschlüsselte FIN${cohort === 1 ? "" : "s"} in dieser Gruppe — die Seite ist für Suchmaschinen ausgeblendet, bis die Kohorte wächst.`,
  vinTokenHeading: "Was diese FIN bedeutet",
  vinTokenIntro:
    "Jede BMW-FIN hat 17 Zeichen, aufgeteilt in drei Abschnitte. Bewegen Sie den Mauszeiger über ein Label oder tippen Sie es an, um die Glossar-Definition zu sehen.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (Positionen 1–3) — identifiziert Hersteller und Region.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (Positionen 4–8) — Modell, Karosserie, Rückhaltesystem.",
  vinTokenCheckLabel: "Prüfziffer",
  vinTokenCheckHint: "Position 9 — ISO-3779-Prüfsumme, die Tippfehler eines einzelnen Zeichens erkennt.",
  vinTokenMyLetterLabel: "Modelljahr",
  vinTokenMyLetterHint: year =>
    year ? `Position 10 — Buchstabe codiert das Modelljahr (${year}).` : "Position 10 — Buchstabe codiert das Modelljahr.",
  vinTokenPlantLabel: "Werk",
  vinTokenPlantHint: city =>
    city ? `Position 11 — ein Zeichen identifiziert das Montagewerk (${city}).` : "Position 11 — ein Zeichen identifiziert das Montagewerk.",
  vinTokenSerialLabel: "Seriennummer",
  vinTokenSerialHint: "Positionen 12–17 — fortlaufende Produktionsnummer.",
};

// =============================================================================
// fr-FR (French)
// =============================================================================
export const frFRVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "châssis", year: "année-modèle", plant: "usine",
    market: "marché", paint: "peinture", option: "option d'usine",
  },
  homeMetaTitle: "BMV.VIN — Décodeur VIN BMW gratuit & recherche VIN",
  homeMetaDescription:
    "Décodez n'importe quel VIN BMW, MINI, ALPINA, Rolls-Royce ou BMW Motorrad. Consultez options d'usine, peinture, usine, date de fabrication et pièces OEM — gratuit, instantané, sans inscription.",
  homeH1: "Décodeur VIN BMW gratuit",
  homeIntro:
    "Saisissez un VIN de 17 caractères pour décoder le modèle, le châssis, le moteur, la peinture, les options d'usine, la date de fabrication et l'usine. Nous prenons en charge toutes les marques du BMW Group : BMW, MINI, ALPINA, Rolls-Royce et BMW Motorrad.",
  homeBrandsHeading: "Décoder par marque",
  homeFacetsHeading: "Parcourir par châssis, année, usine, marché, peinture ou option",
  homeGuidesHeading: "Guides VIN",
  homeGlossaryHeading: "Glossaire VIN",
  brandHubMetaTitle: brand => `Décodeur VIN ${brand} — recherche VIN ${brand} gratuite | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `Décodez n'importe quel VIN ${brand} : modèle, châssis, moteur, peinture, options d'usine, date de fabrication et usine. Liens vers les pièces OEM sur bmv.parts.`,
  brandHubH1: brand => `Décodeur VIN ${brand}`,
  brandHubIntro: brand =>
    `Saisissez un VIN ${brand} pour consulter le dossier d'usine. Nous décodons le WMI/VDS/VIS, le code modèle, la lettre d'année-modèle, l'usine, les options et la peinture.`,
  brandHubWmiHeading: "Codes constructeur (WMI)",
  brandHubRelatedHeading: "Décodeurs associés",
  facetIndexMetaTitle: kind => `Parcourir les VIN BMW par ${kind} | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Parcourez les VIN BMW décodés regroupés par ${kind}. Chaque page liste des VIN exemples et des liens vers les pièces OEM.`,
  facetIndexH1: kind => `Parcourir par ${kind}`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — exemples de VIN & pièces OEM | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} VIN BMW décodés pour ${kind} ${value}. Consultez des VIN exemples, options d'usine et achetez des pièces OEM sur bmv.parts.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} VIN exemple${n === 1 ? "" : "s"}`,
  facetHubEmpty: "Aucun VIN décodé dans ce groupe pour l'instant — essayez d'en décoder un avec le formulaire ci-dessus.",
  guideIndexMetaTitle: "Guides VIN BMW — comprendre le VIN | BMV.VIN",
  guideIndexMetaDescription:
    "Guides clairs pour décoder un VIN BMW : WMI/VDS/VIS, chiffre de contrôle, lettre d'année-modèle, codes usine, peinture, codes SA/options et plus.",
  guideIndexH1: "Guides VIN BMW",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "Guides associés",
  glossaryIndexMetaTitle: "Glossaire VIN BMW — termes, codes & abréviations | BMV.VIN",
  glossaryIndexMetaDescription:
    "Définitions de tous les termes liés au VIN BMW : WMI, VDS, VIS, chiffre de contrôle, lettre d'année-modèle, codes SA, codes peinture, codes usine.",
  glossaryIndexH1: "Glossaire VIN BMW",
  glossaryMetaTitle: term => `${term} — glossaire VIN BMW | BMV.VIN`,
  glossaryRelatedHeading: "Termes associés",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "Décoder un autre VIN",
  shopOemPartsCta: "Acheter les pièces OEM sur bmv.parts",
  vinInputLabel: "VIN (17 caractères)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Décoder",
  faqHeading: "Questions fréquentes",
  notFoundH1: "Page introuvable",
  notFoundBody: "Cette page n'existe pas. Essayez la page d'accueil du décodeur ou parcourez par châssis, année ou usine.",
  homeRecentlyDecodedHeading: "VIN récemment décodés",
  brandRecentlyDecodedHeading: brand => `VIN ${brand} récemment décodés`,
  brandTopChassisHeading: brand => `Châssis ${brand} les plus consultés`,
  homeHowToTitle: "Comment décoder un VIN BMW",
  homeHowToDescription:
    "Étape par étape : saisissez le VIN de 17 caractères, lisez le châssis/moteur/options décodés, puis accédez aux pièces OEM.",
  homeHowToSteps: [
    {
      name: "Trouver le VIN de 17 caractères",
      text: "Regardez en bas du pare-brise, sur l'étiquette de montant de portière côté conducteur ou sur la carte grise. Ignorez I, O et Q — les VIN BMW utilisent 0–9 et A–Z sans ces trois lettres.",
    },
    {
      name: "Coller le VIN dans le décodeur",
      text: "Utilisez le décodeur ci-dessus. Le site identifie la marque à partir du WMI (trois premiers caractères) et oriente la requête automatiquement.",
    },
    {
      name: "Lire le dossier d'usine décodé",
      text: "Nous affichons châssis, année-modèle, moteur, peinture, usine, options d'usine (codes SA) et tout manuel propriétaire correspondant. Chaque onglet porte un badge de provenance pour savoir si la réponse provient des données BMW ou d'un décodeur de secours.",
    },
    {
      name: "Parcourir les pièces OEM compatibles",
      text: "Cliquez sur « Acheter les pièces OEM » pour accéder au catalogue bmv.parts filtré sur ce châssis exact.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `Page ${page} sur ${total}`,
  facetPaginationPrev: "← Précédent",
  facetPaginationNext: "Suivant →",
  facetCrossRailHeading: kind => `Parcourir d'autres ${kind} de ce groupe`,
  facetThinCohortNote: cohort =>
    `Seulement ${cohort} VIN décodé${cohort === 1 ? "" : "s"} dans ce groupe pour l'instant — la page est masquée des moteurs de recherche jusqu'à ce que la cohorte grandisse.`,
  vinTokenHeading: "Ce que signifie ce VIN",
  vinTokenIntro:
    "Chaque VIN BMW comporte 17 caractères répartis en trois sections. Survolez ou touchez une étiquette pour voir l'entrée du glossaire.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (positions 1–3) — identifie le constructeur et la région.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (positions 4–8) — modèle, carrosserie, système de retenue.",
  vinTokenCheckLabel: "Chiffre de contrôle",
  vinTokenCheckHint: "Position 9 — somme de contrôle ISO 3779 qui détecte les erreurs de transcription d'un caractère.",
  vinTokenMyLetterLabel: "Année-modèle",
  vinTokenMyLetterHint: year =>
    year ? `Position 10 — la lettre code l'année-modèle (${year}).` : "Position 10 — la lettre code l'année-modèle.",
  vinTokenPlantLabel: "Usine",
  vinTokenPlantHint: city =>
    city ? `Position 11 — un caractère identifie l'usine d'assemblage (${city}).` : "Position 11 — un caractère identifie l'usine d'assemblage.",
  vinTokenSerialLabel: "Numéro de série",
  vinTokenSerialHint: "Positions 12–17 — numéro de production séquentiel.",
};

// =============================================================================
// es-ES (Spanish — Spain)
// =============================================================================
export const esESVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "chasis", year: "año-modelo", plant: "planta",
    market: "mercado", paint: "pintura", option: "opción de fábrica",
  },
  homeMetaTitle: "BMV.VIN — Decodificador gratuito de VIN BMW",
  homeMetaDescription:
    "Decodifica cualquier VIN de BMW, MINI, ALPINA, Rolls-Royce o BMW Motorrad. Consulta opciones de fábrica, pintura, planta, fecha de fabricación y piezas OEM — gratis, al instante, sin registro.",
  homeH1: "Decodificador gratuito de VIN BMW",
  homeIntro:
    "Introduce un VIN de 17 caracteres para decodificar el modelo, el chasis, el motor, la pintura, las opciones de fábrica, la fecha de fabricación y la planta. Soportamos todas las marcas del BMW Group: BMW, MINI, ALPINA, Rolls-Royce y BMW Motorrad.",
  homeBrandsHeading: "Decodificar por marca",
  homeFacetsHeading: "Explorar por chasis, año, planta, mercado, pintura u opción",
  homeGuidesHeading: "Guías VIN",
  homeGlossaryHeading: "Glosario VIN",
  brandHubMetaTitle: brand => `Decodificador VIN ${brand} — búsqueda VIN ${brand} gratis | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `Decodifica cualquier VIN ${brand}: modelo, chasis, motor, pintura, opciones de fábrica, fecha de fabricación y planta. Enlaces a piezas OEM en bmv.parts.`,
  brandHubH1: brand => `Decodificador VIN ${brand}`,
  brandHubIntro: brand =>
    `Introduce un VIN ${brand} para consultar el registro de fábrica. Decodificamos WMI/VDS/VIS, código de modelo, letra de año-modelo, planta, opciones y pintura.`,
  brandHubWmiHeading: "Códigos de fabricante (WMI)",
  brandHubRelatedHeading: "Decodificadores relacionados",
  facetIndexMetaTitle: kind => `Explorar VIN BMW por ${kind} | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Explora VIN BMW decodificados agrupados por ${kind}. Cada página lista VIN de ejemplo y enlaces a piezas OEM.`,
  facetIndexH1: kind => `Explorar por ${kind}`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — ejemplos de VIN y piezas OEM | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} VIN BMW decodificados para ${kind} ${value}. Consulta VIN de ejemplo, opciones de fábrica y compra piezas OEM en bmv.parts.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} VIN de ejemplo`,
  facetHubEmpty: "Aún no hay VIN decodificados en este grupo — prueba a decodificar uno con el formulario de arriba.",
  guideIndexMetaTitle: "Guías VIN BMW — cómo funcionan los VIN | BMV.VIN",
  guideIndexMetaDescription:
    "Guías claras para decodificar VIN BMW: WMI/VDS/VIS, dígito de control, letra de año-modelo, códigos de planta, pintura, códigos SA/opciones y más.",
  guideIndexH1: "Guías VIN BMW",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "Guías relacionadas",
  glossaryIndexMetaTitle: "Glosario VIN BMW — términos, códigos y abreviaturas | BMV.VIN",
  glossaryIndexMetaDescription:
    "Definiciones de todos los términos del VIN BMW: WMI, VDS, VIS, dígito de control, letra de año-modelo, códigos SA, códigos de pintura y de planta.",
  glossaryIndexH1: "Glosario VIN BMW",
  glossaryMetaTitle: term => `${term} — glosario VIN BMW | BMV.VIN`,
  glossaryRelatedHeading: "Términos relacionados",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "Decodificar otro VIN",
  shopOemPartsCta: "Comprar piezas OEM en bmv.parts",
  vinInputLabel: "VIN (17 caracteres)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Decodificar",
  faqHeading: "Preguntas frecuentes",
  notFoundH1: "Página no encontrada",
  notFoundBody: "No hemos encontrado esa página. Prueba la página principal del decodificador o explora por chasis, año o planta.",
  homeRecentlyDecodedHeading: "VIN decodificados recientemente",
  brandRecentlyDecodedHeading: brand => `VIN ${brand} decodificados recientemente`,
  brandTopChassisHeading: brand => `Chasis ${brand} más consultados`,
  homeHowToTitle: "Cómo decodificar un VIN BMW",
  homeHowToDescription:
    "Paso a paso: introduce el VIN de 17 caracteres, lee el chasis/motor/opciones decodificados y salta a las piezas OEM.",
  homeHowToSteps: [
    {
      name: "Encontrar el VIN de 17 caracteres",
      text: "Búscalo en la parte inferior del parabrisas, en la pegatina del marco de la puerta del conductor o en la documentación del vehículo. Omite I, O y Q — los VIN de BMW usan 0–9 y A–Z sin esas tres.",
    },
    {
      name: "Pegar el VIN en el decodificador",
      text: "Usa el decodificador de arriba. El sitio identifica la marca a partir del WMI (los tres primeros caracteres) y enruta la consulta automáticamente.",
    },
    {
      name: "Leer el registro de fábrica decodificado",
      text: "Mostramos chasis, año-modelo, motor, pintura, planta, opciones de fábrica (códigos SA) y cualquier manual de propietario que coincida. Cada pestaña incluye un distintivo de procedencia para que sepas si la respuesta viene de datos de BMW o de un decodificador alternativo.",
    },
    {
      name: "Explorar piezas OEM compatibles",
      text: "Pulsa «Comprar piezas OEM» para ir al catálogo de bmv.parts filtrado por este chasis exacto.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `Página ${page} de ${total}`,
  facetPaginationPrev: "← Anterior",
  facetPaginationNext: "Siguiente →",
  facetCrossRailHeading: kind => `Explorar otros ${kind} de este grupo`,
  facetThinCohortNote: cohort =>
    `Solo ${cohort} VIN decodificado${cohort === 1 ? "" : "s"} en este grupo — la página está oculta a los buscadores hasta que crezca el grupo.`,
  vinTokenHeading: "Qué significa este VIN",
  vinTokenIntro:
    "Cada VIN BMW tiene 17 caracteres divididos en tres secciones. Pasa el cursor o toca una etiqueta para ver la entrada del glosario.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (posiciones 1–3) — identifica al fabricante y la región.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (posiciones 4–8) — modelo, carrocería, sistema de retención.",
  vinTokenCheckLabel: "Dígito de control",
  vinTokenCheckHint: "Posición 9 — suma de control ISO 3779 que detecta errores de transcripción de un solo carácter.",
  vinTokenMyLetterLabel: "Año-modelo",
  vinTokenMyLetterHint: year =>
    year ? `Posición 10 — la letra codifica el año-modelo (${year}).` : "Posición 10 — la letra codifica el año-modelo.",
  vinTokenPlantLabel: "Planta",
  vinTokenPlantHint: city =>
    city ? `Posición 11 — un carácter identifica la planta de ensamblaje (${city}).` : "Posición 11 — un carácter identifica la planta de ensamblaje.",
  vinTokenSerialLabel: "Número de serie",
  vinTokenSerialHint: "Posiciones 12–17 — número de producción secuencial.",
};

// =============================================================================
// es-MX (Spanish — Mexico). Same wording with mild regional preferences.
// =============================================================================
export const esMXVinHost: VinHostStrings = {
  ...esESVinHost,
  homeMetaTitle: "BMV.VIN — Decodificador gratis de VIN BMW",
  homeIntro:
    "Ingresa un VIN de 17 caracteres para decodificar el modelo, el chasis, el motor, la pintura, las opciones de fábrica, la fecha de armado y la planta. Compatible con todas las marcas del BMW Group: BMW, MINI, ALPINA, Rolls-Royce y BMW Motorrad.",
  brandHubIntro: brand =>
    `Ingresa un VIN ${brand} para consultar el registro de fábrica. Decodificamos WMI/VDS/VIS, código de modelo, letra de año-modelo, planta, opciones y pintura.`,
  homeHowToSteps: [
    {
      name: "Encuentra el VIN de 17 caracteres",
      text: "Búscalo en la parte inferior del parabrisas, en la calcomanía del marco de la puerta del conductor o en la tarjeta de circulación. Omite I, O y Q — los VIN de BMW usan 0–9 y A–Z sin esas tres.",
    },
    {
      name: "Pega el VIN en el decodificador",
      text: "Usa el decodificador de arriba. El sitio identifica la marca a partir del WMI (los tres primeros caracteres) y enruta la consulta automáticamente.",
    },
    {
      name: "Lee el registro de fábrica decodificado",
      text: "Mostramos chasis, año-modelo, motor, pintura, planta, opciones de fábrica (códigos SA) y cualquier manual del propietario que coincida. Cada pestaña incluye una insignia de origen para que sepas si la respuesta proviene de datos de BMW o de un decodificador alternativo.",
    },
    {
      name: "Explora piezas OEM compatibles",
      text: "Toca «Comprar piezas OEM» para ir al catálogo de bmv.parts filtrado por este chasis exacto.",
    },
  ],
};

// =============================================================================
// it-IT (Italian)
// =============================================================================
export const itITVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "telaio", year: "anno modello", plant: "stabilimento",
    market: "mercato", paint: "vernice", option: "optional di fabbrica",
  },
  homeMetaTitle: "BMV.VIN — Decoder VIN BMW gratuito",
  homeMetaDescription:
    "Decodifica qualsiasi VIN BMW, MINI, ALPINA, Rolls-Royce o BMW Motorrad. Consulta optional di fabbrica, vernice, stabilimento, data di costruzione e ricambi OEM — gratis, immediato, senza registrazione.",
  homeH1: "Decoder VIN BMW gratuito",
  homeIntro:
    "Inserisci un VIN di 17 caratteri per decodificare modello, telaio, motore, vernice, optional di fabbrica, data di costruzione e stabilimento. Supportiamo tutti i marchi del BMW Group: BMW, MINI, ALPINA, Rolls-Royce e BMW Motorrad.",
  homeBrandsHeading: "Decodifica per marca",
  homeFacetsHeading: "Sfoglia per telaio, anno, stabilimento, mercato, vernice o optional",
  homeGuidesHeading: "Guide VIN",
  homeGlossaryHeading: "Glossario VIN",
  brandHubMetaTitle: brand => `Decoder VIN ${brand} — ricerca VIN ${brand} gratuita | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `Decodifica qualsiasi VIN ${brand}: modello, telaio, motore, vernice, optional di fabbrica, data di costruzione e stabilimento. Collegamento ai ricambi OEM su bmv.parts.`,
  brandHubH1: brand => `Decoder VIN ${brand}`,
  brandHubIntro: brand =>
    `Inserisci un VIN ${brand} per consultare il record di fabbrica. Decodifichiamo WMI/VDS/VIS, codice modello, lettera dell'anno modello, stabilimento, optional e vernice.`,
  brandHubWmiHeading: "Codici costruttore (WMI)",
  brandHubRelatedHeading: "Decoder correlati",
  facetIndexMetaTitle: kind => `Sfoglia i VIN BMW per ${kind} | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Sfoglia i VIN BMW decodificati raggruppati per ${kind}. Ogni pagina elenca VIN di esempio e collegamenti ai ricambi OEM.`,
  facetIndexH1: kind => `Sfoglia per ${kind}`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — esempi VIN e ricambi OEM | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} VIN BMW decodificati per ${kind} ${value}. Visualizza VIN di esempio, optional di fabbrica e acquista ricambi OEM su bmv.parts.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} VIN di esempio`,
  facetHubEmpty: "Ancora nessun VIN decodificato in questo gruppo — prova a decodificarne uno con il modulo qui sopra.",
  guideIndexMetaTitle: "Guide VIN BMW — come funzionano i VIN | BMV.VIN",
  guideIndexMetaDescription:
    "Guide chiare per decodificare i VIN BMW: WMI/VDS/VIS, cifra di controllo, lettera dell'anno modello, codici stabilimento, vernice, codici SA/optional e altro.",
  guideIndexH1: "Guide VIN BMW",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "Guide correlate",
  glossaryIndexMetaTitle: "Glossario VIN BMW — termini, codici e abbreviazioni | BMV.VIN",
  glossaryIndexMetaDescription:
    "Definizioni di tutti i termini del VIN BMW: WMI, VDS, VIS, cifra di controllo, lettera dell'anno modello, codici SA, codici vernice, codici stabilimento.",
  glossaryIndexH1: "Glossario VIN BMW",
  glossaryMetaTitle: term => `${term} — glossario VIN BMW | BMV.VIN`,
  glossaryRelatedHeading: "Termini correlati",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "Decodifica un altro VIN",
  shopOemPartsCta: "Acquista ricambi OEM su bmv.parts",
  vinInputLabel: "VIN (17 caratteri)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Decodifica",
  faqHeading: "Domande frequenti",
  notFoundH1: "Pagina non trovata",
  notFoundBody: "Non abbiamo trovato questa pagina. Prova la home del decoder o sfoglia per telaio, anno o stabilimento.",
  homeRecentlyDecodedHeading: "VIN decodificati di recente",
  brandRecentlyDecodedHeading: brand => `VIN ${brand} decodificati di recente`,
  brandTopChassisHeading: brand => `Telai ${brand} più consultati`,
  homeHowToTitle: "Come decodificare un VIN BMW",
  homeHowToDescription:
    "Passo dopo passo: inserisci il VIN di 17 caratteri, leggi telaio/motore/optional decodificati, poi vai ai ricambi OEM.",
  homeHowToSteps: [
    {
      name: "Trovare il VIN di 17 caratteri",
      text: "Guarda in basso al parabrezza, sull'adesivo del montante porta lato guida o sul libretto di circolazione. Salta I, O e Q — i VIN BMW usano 0–9 e A–Z senza queste tre lettere.",
    },
    {
      name: "Incollare il VIN nel decoder",
      text: "Usa il decoder qui sopra. Il sito identifica la marca dal WMI (primi tre caratteri) e instrada la ricerca automaticamente.",
    },
    {
      name: "Leggere il record di fabbrica decodificato",
      text: "Mostriamo telaio, anno modello, motore, vernice, stabilimento, optional di fabbrica (codici SA) e qualsiasi libretto di uso e manutenzione corrispondente. Ogni scheda riporta un'etichetta di provenienza per capire se la risposta viene dai dati ufficiali BMW o da un decoder di riserva.",
    },
    {
      name: "Sfogliare i ricambi OEM compatibili",
      text: "Clicca su «Acquista ricambi OEM» per andare al catalogo bmv.parts filtrato su questo telaio.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `Pagina ${page} di ${total}`,
  facetPaginationPrev: "← Precedente",
  facetPaginationNext: "Successiva →",
  facetCrossRailHeading: kind => `Sfoglia altri ${kind} di questo gruppo`,
  facetThinCohortNote: cohort =>
    `Solo ${cohort} VIN decodificato${cohort === 1 ? "" : "i"} in questo gruppo — la pagina è nascosta ai motori di ricerca finché il gruppo non cresce.`,
  vinTokenHeading: "Cosa significa questo VIN",
  vinTokenIntro:
    "Ogni VIN BMW è composto da 17 caratteri divisi in tre sezioni. Passa sopra o tocca un'etichetta per vedere la voce del glossario.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (posizioni 1–3) — identifica costruttore e regione.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (posizioni 4–8) — modello, carrozzeria, sistema di ritenuta.",
  vinTokenCheckLabel: "Cifra di controllo",
  vinTokenCheckHint: "Posizione 9 — somma di controllo ISO 3779 che rileva errori di trascrizione di un singolo carattere.",
  vinTokenMyLetterLabel: "Anno modello",
  vinTokenMyLetterHint: year =>
    year ? `Posizione 10 — la lettera codifica l'anno modello (${year}).` : "Posizione 10 — la lettera codifica l'anno modello.",
  vinTokenPlantLabel: "Stabilimento",
  vinTokenPlantHint: city =>
    city ? `Posizione 11 — un carattere identifica lo stabilimento di assemblaggio (${city}).` : "Posizione 11 — un carattere identifica lo stabilimento di assemblaggio.",
  vinTokenSerialLabel: "Numero di serie",
  vinTokenSerialHint: "Posizioni 12–17 — numero di produzione progressivo.",
};

// =============================================================================
// pt-BR (Portuguese — Brazil)
// =============================================================================
export const ptBRVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "chassi", year: "ano-modelo", plant: "fábrica",
    market: "mercado", paint: "pintura", option: "opcional de fábrica",
  },
  homeMetaTitle: "BMV.VIN — Decodificador gratuito de VIN BMW",
  homeMetaDescription:
    "Decodifique qualquer VIN BMW, MINI, ALPINA, Rolls-Royce ou BMW Motorrad. Consulte opcionais de fábrica, pintura, fábrica, data de fabricação e peças OEM — grátis, instantâneo, sem cadastro.",
  homeH1: "Decodificador gratuito de VIN BMW",
  homeIntro:
    "Digite um VIN de 17 caracteres para decodificar modelo, chassi, motor, pintura, opcionais de fábrica, data de fabricação e fábrica. Suportamos todas as marcas do BMW Group: BMW, MINI, ALPINA, Rolls-Royce e BMW Motorrad.",
  homeBrandsHeading: "Decodificar por marca",
  homeFacetsHeading: "Navegar por chassi, ano, fábrica, mercado, pintura ou opcional",
  homeGuidesHeading: "Guias de VIN",
  homeGlossaryHeading: "Glossário de VIN",
  brandHubMetaTitle: brand => `Decodificador VIN ${brand} — consulta VIN ${brand} grátis | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `Decodifique qualquer VIN ${brand}: modelo, chassi, motor, pintura, opcionais de fábrica, data de fabricação e fábrica. Links para peças OEM em bmv.parts.`,
  brandHubH1: brand => `Decodificador VIN ${brand}`,
  brandHubIntro: brand =>
    `Digite um VIN ${brand} para consultar o registro de fábrica. Decodificamos WMI/VDS/VIS, código do modelo, letra do ano-modelo, fábrica, opcionais e pintura.`,
  brandHubWmiHeading: "Códigos do fabricante (WMI)",
  brandHubRelatedHeading: "Decodificadores relacionados",
  facetIndexMetaTitle: kind => `Navegar VINs BMW por ${kind} | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Navegue VINs BMW decodificados agrupados por ${kind}. Cada página lista VINs de exemplo e links para peças OEM.`,
  facetIndexH1: kind => `Navegar por ${kind}`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — exemplos de VIN e peças OEM | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} VINs BMW decodificados para ${kind} ${value}. Veja VINs de exemplo, opcionais de fábrica e compre peças OEM em bmv.parts.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} VIN de exemplo`,
  facetHubEmpty: "Ainda não há VINs decodificados neste grupo — tente decodificar um com o formulário acima.",
  guideIndexMetaTitle: "Guias de VIN BMW — como o VIN funciona | BMV.VIN",
  guideIndexMetaDescription:
    "Guias claros para decodificar VINs BMW: WMI/VDS/VIS, dígito verificador, letra do ano-modelo, códigos de fábrica, pintura, códigos SA/opcionais e mais.",
  guideIndexH1: "Guias de VIN BMW",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "Guias relacionados",
  glossaryIndexMetaTitle: "Glossário de VIN BMW — termos, códigos e abreviações | BMV.VIN",
  glossaryIndexMetaDescription:
    "Definições de todos os termos do VIN BMW: WMI, VDS, VIS, dígito verificador, letra do ano-modelo, códigos SA, códigos de pintura e de fábrica.",
  glossaryIndexH1: "Glossário de VIN BMW",
  glossaryMetaTitle: term => `${term} — glossário de VIN BMW | BMV.VIN`,
  glossaryRelatedHeading: "Termos relacionados",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "Decodificar outro VIN",
  shopOemPartsCta: "Comprar peças OEM em bmv.parts",
  vinInputLabel: "VIN (17 caracteres)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Decodificar",
  faqHeading: "Perguntas frequentes",
  notFoundH1: "Página não encontrada",
  notFoundBody: "Não encontramos esta página. Tente a home do decodificador ou navegue por chassi, ano ou fábrica.",
  homeRecentlyDecodedHeading: "VINs decodificados recentemente",
  brandRecentlyDecodedHeading: brand => `VINs ${brand} decodificados recentemente`,
  brandTopChassisHeading: brand => `Principais chassis ${brand}`,
  homeHowToTitle: "Como decodificar um VIN BMW",
  homeHowToDescription:
    "Passo a passo: digite o VIN de 17 caracteres, leia chassi/motor/opcionais decodificados e vá para as peças OEM.",
  homeHowToSteps: [
    {
      name: "Encontrar o VIN de 17 caracteres",
      text: "Procure na parte inferior do para-brisa, no adesivo da coluna da porta do motorista ou no documento do veículo. Pule I, O e Q — VINs BMW usam 0–9 e A–Z sem essas três.",
    },
    {
      name: "Colar o VIN no decodificador",
      text: "Use o decodificador acima. O site identifica a marca pelo WMI (primeiros três caracteres) e roteia a consulta automaticamente.",
    },
    {
      name: "Ler o registro de fábrica decodificado",
      text: "Mostramos chassi, ano-modelo, motor, pintura, fábrica, opcionais de fábrica (códigos SA) e qualquer manual do proprietário compatível. Cada aba traz um selo de procedência para você saber se a resposta veio de dados oficiais BMW ou de um decodificador alternativo.",
    },
    {
      name: "Navegar peças OEM compatíveis",
      text: "Clique em «Comprar peças OEM» para abrir o catálogo bmv.parts filtrado por este chassi.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `Página ${page} de ${total}`,
  facetPaginationPrev: "← Anterior",
  facetPaginationNext: "Próxima →",
  facetCrossRailHeading: kind => `Navegar outros ${kind} deste grupo`,
  facetThinCohortNote: cohort =>
    `Apenas ${cohort} VIN decodificado${cohort === 1 ? "" : "s"} neste grupo — a página fica oculta aos buscadores até o grupo crescer.`,
  vinTokenHeading: "O que este VIN significa",
  vinTokenIntro:
    "Todo VIN BMW tem 17 caracteres divididos em três seções. Passe o cursor ou toque em um rótulo para ver a entrada do glossário.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (posições 1–3) — identifica fabricante e região.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (posições 4–8) — modelo, carroceria, sistema de retenção.",
  vinTokenCheckLabel: "Dígito verificador",
  vinTokenCheckHint: "Posição 9 — checksum ISO 3779 que detecta erros de transcrição de um caractere.",
  vinTokenMyLetterLabel: "Ano-modelo",
  vinTokenMyLetterHint: year =>
    year ? `Posição 10 — a letra codifica o ano-modelo (${year}).` : "Posição 10 — a letra codifica o ano-modelo.",
  vinTokenPlantLabel: "Fábrica",
  vinTokenPlantHint: city =>
    city ? `Posição 11 — um caractere identifica a fábrica de montagem (${city}).` : "Posição 11 — um caractere identifica a fábrica de montagem.",
  vinTokenSerialLabel: "Número de série",
  vinTokenSerialHint: "Posições 12–17 — número de produção sequencial.",
};

// =============================================================================
// en-ZA (English — South Africa). Mirrors English copy with metric/SA spelling.
// =============================================================================
export const enZAVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "chassis", year: "model year", plant: "assembly plant",
    market: "market", paint: "colour", option: "factory option",
  },
  homeMetaTitle: "BMV.VIN — Free BMW VIN Decoder & VIN Lookup (South Africa)",
  homeMetaDescription:
    "Decode any BMW, MINI, ALPINA, Rolls-Royce or BMW Motorrad VIN. Look up factory options, colour, plant, build date and genuine parts — free, instant, no sign-up. Includes Plant Rosslyn-built models.",
  homeH1: "Free BMW VIN decoder — South Africa",
  homeIntro:
    "Enter a 17-character VIN to decode the model, chassis, engine, colour, factory options, build date and assembly plant. We support every BMW Group marque sold in South Africa: BMW, MINI, ALPINA, Rolls-Royce and BMW Motorrad — including Plant Rosslyn-built X3 models.",
  homeBrandsHeading: "Decode by marque",
  homeFacetsHeading: "Browse by chassis, year, plant, market, colour or option",
  homeGuidesHeading: "VIN decoder guides",
  homeGlossaryHeading: "VIN terms glossary",
  brandHubMetaTitle: brand => `${brand} VIN decoder — free ${brand} VIN lookup South Africa | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `Decode any ${brand} VIN: model, chassis, engine, colour, factory options, build date and assembly plant. Cross-link to genuine parts on bmv.parts.`,
  brandHubH1: brand => `${brand} VIN decoder — South Africa`,
  brandHubIntro: brand =>
    `Enter a ${brand} VIN to retrieve the factory build record. We decode the WMI/VDS/VIS, model code, model year letter, plant, options and colour.`,
  brandHubWmiHeading: "Maker codes (WMI)",
  brandHubRelatedHeading: "Similar decoders",
  facetIndexMetaTitle: kind => `Search BMW VINs by ${kind} | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Browse decoded BMW VINs grouped by ${kind}. Each hub lists example VINs and links to genuine parts.`,
  facetIndexH1: kind => `Search by ${kind}`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — VIN samples & genuine parts | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} decoded BMW VINs for ${kind} ${value}. View example VINs, factory options and shop genuine parts on bmv.parts.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} — ${kind}`,
  facetHubExamplesHeading: n => `${n} VIN sample${n === 1 ? "" : "s"}`,
  facetHubEmpty: "No decoded VINs in this group yet — try decoding one using the form above.",
  guideIndexMetaTitle: "BMW VIN decoder guides — how VINs work | BMV.VIN",
  guideIndexMetaDescription:
    "Step-by-step guides to decoding BMW VINs: WMI/VDS/VIS, check digit, model year letter, plant codes, colour, SA/option codes and more.",
  guideIndexH1: "BMW VIN decoder guides",
  guideMetaTitle: title => `${title} — BMW VIN | BMV.VIN`,
  guideRelatedHeading: "Similar guides",
  glossaryIndexMetaTitle: "BMW VIN glossary — terms, codes & abbreviations explained | BMV.VIN",
  glossaryIndexMetaDescription:
    "Definitions for every term found on a BMW VIN: WMI, VDS, VIS, check digit, model year letter, SA codes, colour codes, plant codes.",
  glossaryIndexH1: "BMW VIN terms glossary",
  glossaryMetaTitle: term => `${term} explained — BMW VIN glossary | BMV.VIN`,
  glossaryRelatedHeading: "Similar terms",
  breadcrumbHome: "BMV.VIN Home",
  decodeAnotherCta: "Run another VIN decode",
  shopOemPartsCta: "Shop genuine parts on bmv.parts",
  vinInputLabel: "VIN number (17 characters)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Decode VIN",
  faqHeading: "Common questions",
  notFoundH1: "404 — page not found",
  notFoundBody: "That page could not be found. Return to the decoder home or browse by chassis, year or plant.",
  homeRecentlyDecodedHeading: "Recently decoded VINs in South Africa",
  brandRecentlyDecodedHeading: brand => `Recently decoded ${brand} VINs — South Africa`,
  brandTopChassisHeading: brand => `Most popular ${brand} chassis`,
  homeHowToTitle: "How to decode your BMW VIN",
  homeHowToDescription:
    "Step-by-step: enter the 17-character VIN, review the decoded chassis, engine and options, then shop genuine parts.",
  homeHowToSteps: [
    {
      name: "Locate the 17-character VIN",
      text: "Look on the lower windscreen, the driver-side door jamb sticker or your vehicle registration certificate. Skip I, O and Q — BMW VINs use 0–9 and A–Z minus those three.",
    },
    {
      name: "Enter the VIN into the decoder",
      text: "Paste your VIN into the decoder above. The site identifies the marque from the WMI (first three characters) and routes the lookup automatically.",
    },
    {
      name: "Review the decoded factory build record",
      text: "We display chassis, model year, engine, colour, plant, factory options (SA codes) and any owner's manual we can match. Each tab carries a provenance badge so you can see whether the data comes from BMW first-party records or a fallback decoder.",
    },
    {
      name: "Shop genuine parts that fit this VIN",
      text: "Click the 'Shop genuine parts' link to open the bmv.parts catalogue pre-filtered to this exact chassis.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `Page ${page} of ${total} pages`,
  facetPaginationPrev: "← Prev",
  facetPaginationNext: "Next page →",
  facetCrossRailHeading: kind => `Explore other ${kind}s in this group`,
  facetThinCohortNote: cohort =>
    `Only ${cohort} decoded VIN${cohort === 1 ? "" : "s"} in this group so far — hidden from search engines until the cohort grows.`,
  vinTokenHeading: "Decoding this VIN",
  vinTokenIntro:
    "Every BMW VIN has 17 characters divided into three sections. Hover or tap a label to view the glossary definition.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (positions 1–3) — identifies the manufacturer and region of assembly.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (positions 4–8) — model, body style and restraint system.",
  vinTokenCheckLabel: "Verification digit",
  vinTokenCheckHint: "Position 9 — ISO 3779 checksum used to catch single-character transcription errors.",
  vinTokenMyLetterLabel: "Build year",
  vinTokenMyLetterHint: year =>
    year ? `Position 10 — letter encodes the build year (${year}).` : "Position 10 — letter encodes the build year.",
  vinTokenPlantLabel: "Assembly plant",
  vinTokenPlantHint: city =>
    city ? `Position 11 — single character identifies the assembly plant (${city}).` : "Position 11 — single character identifies where the vehicle was assembled.",
  vinTokenSerialLabel: "Build number",
  vinTokenSerialHint: "Positions 12–17 — sequential build number assigned at the factory.",
};

// =============================================================================
// ru-RU (Russian)
// =============================================================================
export const ruRUVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "кузов", year: "модельный год", plant: "завод",
    market: "рынок", paint: "цвет кузова", option: "заводская опция",
  },
  homeMetaTitle: "BMV.VIN — бесплатный декодер VIN BMW",
  homeMetaDescription:
    "Расшифруйте любой VIN BMW, MINI, ALPINA, Rolls-Royce или BMW Motorrad. Узнайте заводские опции, цвет, завод, дату выпуска и оригинальные запчасти — бесплатно, мгновенно, без регистрации.",
  homeH1: "Бесплатный декодер VIN BMW",
  homeIntro:
    "Введите 17-значный VIN, чтобы расшифровать модель, кузов, двигатель, цвет, заводские опции, дату выпуска и завод. Поддерживаем все марки BMW Group: BMW, MINI, ALPINA, Rolls-Royce и BMW Motorrad.",
  homeBrandsHeading: "Декодировать по марке",
  homeFacetsHeading: "Просмотр по кузову, году, заводу, рынку, цвету или опции",
  homeGuidesHeading: "Руководства по VIN",
  homeGlossaryHeading: "Глоссарий VIN",
  brandHubMetaTitle: brand => `Декодер VIN ${brand} — бесплатная расшифровка ${brand} | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `Расшифруйте любой VIN ${brand}: модель, кузов, двигатель, цвет, заводские опции, дату выпуска и завод. Ссылки на оригинальные запчасти на bmv.parts.`,
  brandHubH1: brand => `Декодер VIN ${brand}`,
  brandHubIntro: brand =>
    `Введите VIN ${brand}, чтобы получить заводскую запись. Расшифровываем WMI/VDS/VIS, код модели, букву модельного года, завод, опции и цвет.`,
  brandHubWmiHeading: "Коды производителя (WMI)",
  brandHubRelatedHeading: "Связанные декодеры",
  facetIndexMetaTitle: kind => `VIN BMW по ${kind} | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `Расшифрованные VIN BMW сгруппированы по ${kind}. На каждой странице — примеры VIN и ссылки на оригинальные запчасти.`,
  facetIndexH1: kind => `Просмотр по ${kind}`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — примеры VIN и оригинальные запчасти | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${cohort} расшифрованных VIN BMW для ${kind} ${value}. Примеры VIN, заводские опции и оригинальные запчасти на bmv.parts.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} пример${n === 1 ? "" : n < 5 ? "а" : "ов"} VIN`,
  facetHubEmpty: "В этой группе пока нет расшифрованных VIN — попробуйте расшифровать через форму выше.",
  guideIndexMetaTitle: "Руководства по VIN BMW — как устроен VIN | BMV.VIN",
  guideIndexMetaDescription:
    "Понятные руководства по расшифровке VIN BMW: WMI/VDS/VIS, контрольная цифра, буква модельного года, коды заводов, цвет, коды SA и другое.",
  guideIndexH1: "Руководства по VIN BMW",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "Похожие руководства",
  glossaryIndexMetaTitle: "Глоссарий VIN BMW — термины, коды и сокращения | BMV.VIN",
  glossaryIndexMetaDescription:
    "Определения всех терминов VIN BMW: WMI, VDS, VIS, контрольная цифра, буква модельного года, коды SA, коды цветов и заводов.",
  glossaryIndexH1: "Глоссарий VIN BMW",
  glossaryMetaTitle: term => `${term} — глоссарий VIN BMW | BMV.VIN`,
  glossaryRelatedHeading: "Связанные термины",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "Расшифровать другой VIN",
  shopOemPartsCta: "Оригинальные запчасти на bmv.parts",
  vinInputLabel: "VIN (17 символов)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "Расшифровать",
  faqHeading: "Часто задаваемые вопросы",
  notFoundH1: "Страница не найдена",
  notFoundBody: "Эту страницу не удалось найти. Попробуйте главную декодера или просмотр по кузову, году или заводу.",
  homeRecentlyDecodedHeading: "Недавно расшифрованные VIN",
  brandRecentlyDecodedHeading: brand => `Недавно расшифрованные VIN ${brand}`,
  brandTopChassisHeading: brand => `Популярные кузова ${brand}`,
  homeHowToTitle: "Как расшифровать VIN BMW",
  homeHowToDescription:
    "Шаг за шагом: введите 17-значный VIN, прочитайте расшифровку кузова/двигателя/опций, перейдите к оригинальным запчастям.",
  homeHowToSteps: [
    {
      name: "Найдите 17-значный VIN",
      text: "Смотрите на нижней части лобового стекла, на наклейке стойки двери водителя или в документах на автомобиль. Пропустите I, O и Q — VIN BMW используют 0–9 и A–Z без этих трёх букв.",
    },
    {
      name: "Вставьте VIN в декодер",
      text: "Используйте декодер выше. Сайт определяет марку по WMI (первые три символа) и направляет запрос автоматически.",
    },
    {
      name: "Прочитайте расшифрованную заводскую запись",
      text: "Показываем кузов, модельный год, двигатель, цвет, завод, заводские опции (коды SA) и подходящие руководства владельца. На каждой вкладке — отметка источника, чтобы видеть, пришёл ответ из официальных данных BMW или из резервного декодера.",
    },
    {
      name: "Просмотрите подходящие оригинальные запчасти",
      text: "Нажмите «Оригинальные запчасти», чтобы перейти в каталог bmv.parts с фильтром по этому кузову.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `Страница ${page} из ${total}`,
  facetPaginationPrev: "← Назад",
  facetPaginationNext: "Вперёд →",
  facetCrossRailHeading: kind => `Другие ${kind} в этой группе`,
  facetThinCohortNote: cohort =>
    `В этой группе пока только ${cohort} расшифрованных VIN — страница скрыта от поисковиков до роста выборки.`,
  vinTokenHeading: "Что означает этот VIN",
  vinTokenIntro:
    "Каждый VIN BMW состоит из 17 символов в трёх секциях. Наведите курсор или нажмите на метку, чтобы увидеть запись глоссария.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (позиции 1–3) — определяет производителя и регион.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (позиции 4–8) — модель, кузов, система удержания.",
  vinTokenCheckLabel: "Контрольная цифра",
  vinTokenCheckHint: "Позиция 9 — контрольная сумма ISO 3779, выявляющая опечатку в одном символе.",
  vinTokenMyLetterLabel: "Модельный год",
  vinTokenMyLetterHint: year =>
    year ? `Позиция 10 — буква кодирует модельный год (${year}).` : "Позиция 10 — буква кодирует модельный год.",
  vinTokenPlantLabel: "Завод",
  vinTokenPlantHint: city =>
    city ? `Позиция 11 — символ обозначает сборочный завод (${city}).` : "Позиция 11 — символ обозначает сборочный завод.",
  vinTokenSerialLabel: "Серийный номер",
  vinTokenSerialHint: "Позиции 12–17 — последовательный производственный номер.",
};

// =============================================================================
// zh-CN (Simplified Chinese)
// =============================================================================
export const zhCNVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "底盘", year: "车型年款", plant: "工厂",
    market: "市场", paint: "外观颜色", option: "原厂选装",
  },
  homeMetaTitle: "BMV.VIN — 免费宝马 VIN 解码与查询",
  homeMetaDescription:
    "解码任何宝马、MINI、ALPINA、劳斯莱斯或宝马摩托车 VIN。查询原厂选装、车漆、工厂、生产日期和原厂配件 — 免费、即时、无需注册。",
  homeH1: "免费宝马 VIN 解码器",
  homeIntro:
    "输入 17 位 VIN 即可解码车型、底盘、发动机、车漆、原厂选装、生产日期和组装工厂。支持宝马集团旗下全部品牌:宝马、MINI、ALPINA、劳斯莱斯和宝马摩托车。",
  homeBrandsHeading: "按品牌解码",
  homeFacetsHeading: "按底盘、年款、工厂、市场、车漆或选装查询",
  homeGuidesHeading: "VIN 指南",
  homeGlossaryHeading: "VIN 术语表",
  brandHubMetaTitle: brand => `${brand} VIN 解码器 — 免费 ${brand} VIN 查询 | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `解码任何 ${brand} VIN:车型、底盘、发动机、车漆、原厂选装、生产日期和组装工厂。可跳转 bmv.parts 查询原厂配件。`,
  brandHubH1: brand => `${brand} VIN 解码器`,
  brandHubIntro: brand =>
    `输入 ${brand} VIN 即可查询出厂记录。我们解码 WMI/VDS/VIS、车型代码、车型年款字母、工厂、选装和车漆。`,
  brandHubWmiHeading: "厂商代码 (WMI)",
  brandHubRelatedHeading: "相关解码器",
  facetIndexMetaTitle: kind => `按${kind}浏览宝马 VIN | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `按${kind}分组浏览已解码的宝马 VIN。每个页面列出示例 VIN 和原厂配件链接。`,
  facetIndexH1: kind => `按${kind}浏览`,
  facetHubMetaTitle: ({ kind, value }) => `宝马 ${value} (${kind}) — VIN 示例与原厂配件 | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${kind} ${value} 已解码 ${cohort} 个宝马 VIN。查看示例 VIN、原厂选装并在 bmv.parts 上购买原厂配件。`,
  facetHubH1: ({ kind, value }) => `宝马 ${value} (${kind})`,
  facetHubExamplesHeading: n => `${n} 个示例 VIN`,
  facetHubEmpty: "此分组中尚无已解码 VIN — 请使用上方表单进行解码。",
  guideIndexMetaTitle: "宝马 VIN 指南 — 了解 VIN 的工作原理 | BMV.VIN",
  guideIndexMetaDescription:
    "通俗易懂的宝马 VIN 解码指南:WMI/VDS/VIS、校验位、车型年款字母、工厂代码、车漆、SA/选装代码等。",
  guideIndexH1: "宝马 VIN 指南",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "相关指南",
  glossaryIndexMetaTitle: "宝马 VIN 术语表 — 术语、代码与缩写 | BMV.VIN",
  glossaryIndexMetaDescription:
    "宝马 VIN 上每个术语的定义:WMI、VDS、VIS、校验位、车型年款字母、SA 代码、车漆代码、工厂代码。",
  glossaryIndexH1: "宝马 VIN 术语表",
  glossaryMetaTitle: term => `${term} — 宝马 VIN 术语表 | BMV.VIN`,
  glossaryRelatedHeading: "相关术语",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "解码另一个 VIN",
  shopOemPartsCta: "在 bmv.parts 购买原厂配件",
  vinInputLabel: "VIN (17 位字符)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "解码",
  faqHeading: "常见问题",
  notFoundH1: "页面未找到",
  notFoundBody: "未能找到该页面。请尝试解码器首页,或按底盘、年款或工厂浏览。",
  homeRecentlyDecodedHeading: "最近解码的 VIN",
  brandRecentlyDecodedHeading: brand => `最近解码的 ${brand} VIN`,
  brandTopChassisHeading: brand => `${brand} 热门底盘`,
  homeHowToTitle: "如何解码宝马 VIN",
  homeHowToDescription:
    "分步骤:输入 17 位 VIN,查看解码后的底盘/发动机/选装,然后跳转到原厂配件。",
  homeHowToSteps: [
    {
      name: "找到 17 位 VIN",
      text: "查看挡风玻璃左下角、驾驶员侧门框贴纸或行驶证。VIN 不含 I、O、Q — 宝马 VIN 使用 0–9 与 A–Z(去掉这三个字母)。",
    },
    {
      name: "将 VIN 粘贴到解码器",
      text: "使用上方解码器。网站会根据 WMI(前三个字符)识别品牌并自动路由查询。",
    },
    {
      name: "阅读解码后的出厂记录",
      text: "我们显示底盘、车型年款、发动机、车漆、工厂、原厂选装(SA 代码)及匹配的车主手册。每个标签都带有数据来源标识,便于您判断结果来自宝马一手数据还是备用解码器。",
    },
    {
      name: "浏览匹配的原厂配件",
      text: "点击「在 bmv.parts 购买原厂配件」,跳转到按当前底盘筛选的 bmv.parts 目录。",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `第 ${page} 页 / 共 ${total} 页`,
  facetPaginationPrev: "← 上一页",
  facetPaginationNext: "下一页 →",
  facetCrossRailHeading: kind => `浏览本组其他${kind}`,
  facetThinCohortNote: cohort =>
    `本组目前仅有 ${cohort} 个已解码 VIN — 在样本量增长前,该页面对搜索引擎隐藏。`,
  vinTokenHeading: "此 VIN 的含义",
  vinTokenIntro:
    "每个宝马 VIN 由 17 个字符组成,分为三段。将鼠标悬停或点击标签,可查看术语表条目。",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier(第 1–3 位)— 标识制造商与地区。",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section(第 4–8 位)— 车型、车身、约束系统。",
  vinTokenCheckLabel: "校验位",
  vinTokenCheckHint: "第 9 位 — ISO 3779 校验和,用于发现单字符录入错误。",
  vinTokenMyLetterLabel: "车型年款",
  vinTokenMyLetterHint: year =>
    year ? `第 10 位 — 字母代表车型年款 (${year})。` : "第 10 位 — 字母代表车型年款。",
  vinTokenPlantLabel: "工厂",
  vinTokenPlantHint: city =>
    city ? `第 11 位 — 单字符标识组装工厂 (${city})。` : "第 11 位 — 单字符标识组装工厂。",
  vinTokenSerialLabel: "序列号",
  vinTokenSerialHint: "第 12–17 位 — 按生产顺序的流水号。",
};

// =============================================================================
// ko-KR (Korean)
// =============================================================================
export const koKRVinHost: VinHostStrings = {
  brand: COMMON_BRAND,
  facetKind: {
    chassis: "섀시", year: "모델 연식", plant: "공장",
    market: "시장", paint: "외장 색상", option: "공장 옵션",
  },
  homeMetaTitle: "BMV.VIN — 무료 BMW VIN 디코더 및 조회",
  homeMetaDescription:
    "BMW, MINI, ALPINA, Rolls-Royce, BMW Motorrad의 모든 VIN을 디코딩하세요. 공장 옵션, 도장, 공장, 생산일자, OEM 부품 정보 — 무료, 즉시, 가입 불필요.",
  homeH1: "무료 BMW VIN 디코더",
  homeIntro:
    "17자리 VIN을 입력하면 모델, 섀시, 엔진, 도장, 공장 옵션, 생산일자, 조립 공장을 디코딩합니다. BMW Group의 모든 브랜드를 지원합니다: BMW, MINI, ALPINA, Rolls-Royce, BMW Motorrad.",
  homeBrandsHeading: "브랜드별 디코딩",
  homeFacetsHeading: "섀시·연식·공장·시장·도장·옵션별 보기",
  homeGuidesHeading: "VIN 가이드",
  homeGlossaryHeading: "VIN 용어집",
  brandHubMetaTitle: brand => `${brand} VIN 디코더 — 무료 ${brand} VIN 조회 | BMV.VIN`,
  brandHubMetaDescription: brand =>
    `${brand} VIN을 디코딩하세요: 모델, 섀시, 엔진, 도장, 공장 옵션, 생산일자, 조립 공장. bmv.parts에서 OEM 부품으로 연결됩니다.`,
  brandHubH1: brand => `${brand} VIN 디코더`,
  brandHubIntro: brand =>
    `${brand} VIN을 입력하여 공장 출고 기록을 조회하세요. WMI/VDS/VIS, 모델 코드, 모델 연식 문자, 공장, 옵션, 도장을 디코딩합니다.`,
  brandHubWmiHeading: "제조사 코드 (WMI)",
  brandHubRelatedHeading: "관련 디코더",
  facetIndexMetaTitle: kind => `${kind}로 BMW VIN 보기 | BMV.VIN`,
  facetIndexMetaDescription: kind =>
    `${kind} 기준으로 묶인 디코딩된 BMW VIN을 살펴보세요. 각 페이지에 예시 VIN과 OEM 부품 링크가 있습니다.`,
  facetIndexH1: kind => `${kind}로 보기`,
  facetHubMetaTitle: ({ kind, value }) => `BMW ${value} (${kind}) — VIN 예시 및 OEM 부품 | BMV.VIN`,
  facetHubMetaDescription: ({ kind, value, cohort }) =>
    `${kind} ${value}에 대한 디코딩된 BMW VIN ${cohort}건. 예시 VIN과 공장 옵션을 보고 bmv.parts에서 OEM 부품을 구매하세요.`,
  facetHubH1: ({ kind, value }) => `BMW ${value} (${kind})`,
  facetHubExamplesHeading: n => `예시 VIN ${n}건`,
  facetHubEmpty: "이 그룹에는 아직 디코딩된 VIN이 없습니다 — 위 양식으로 디코딩해 보세요.",
  guideIndexMetaTitle: "BMW VIN 가이드 — VIN의 작동 원리 | BMV.VIN",
  guideIndexMetaDescription:
    "BMW VIN 디코딩을 위한 쉬운 가이드: WMI/VDS/VIS, 체크 디지트, 모델 연식 문자, 공장 코드, 도장, SA·옵션 코드 등.",
  guideIndexH1: "BMW VIN 가이드",
  guideMetaTitle: title => `${title} | BMV.VIN`,
  guideRelatedHeading: "관련 가이드",
  glossaryIndexMetaTitle: "BMW VIN 용어집 — 용어·코드·약어 | BMV.VIN",
  glossaryIndexMetaDescription:
    "BMW VIN에 등장하는 모든 용어의 정의: WMI, VDS, VIS, 체크 디지트, 모델 연식 문자, SA 코드, 도장 코드, 공장 코드.",
  glossaryIndexH1: "BMW VIN 용어집",
  glossaryMetaTitle: term => `${term} — BMW VIN 용어집 | BMV.VIN`,
  glossaryRelatedHeading: "관련 용어",
  breadcrumbHome: "BMV.VIN",
  decodeAnotherCta: "다른 VIN 디코딩",
  shopOemPartsCta: "bmv.parts에서 OEM 부품 구매",
  vinInputLabel: "VIN (17자리)",
  vinInputPlaceholder: "WBA…",
  vinInputSubmit: "디코딩",
  faqHeading: "자주 묻는 질문",
  notFoundH1: "페이지를 찾을 수 없음",
  notFoundBody: "해당 페이지를 찾을 수 없습니다. 디코더 홈으로 가거나 섀시·연식·공장으로 살펴보세요.",
  homeRecentlyDecodedHeading: "최근 디코딩된 VIN",
  brandRecentlyDecodedHeading: brand => `최근 디코딩된 ${brand} VIN`,
  brandTopChassisHeading: brand => `인기 ${brand} 섀시`,
  homeHowToTitle: "BMW VIN 디코딩 방법",
  homeHowToDescription:
    "단계별: 17자리 VIN 입력 → 디코딩된 섀시·엔진·옵션 확인 → OEM 부품으로 이동.",
  homeHowToSteps: [
    {
      name: "17자리 VIN 찾기",
      text: "앞유리 하단, 운전석 도어 잼 스티커 또는 차량 등록증을 확인하세요. I, O, Q는 사용하지 않으며 BMW VIN은 0–9와 이 세 글자를 제외한 A–Z를 사용합니다.",
    },
    {
      name: "VIN을 디코더에 붙여넣기",
      text: "위의 디코더를 사용하세요. 사이트는 WMI(앞 세 자리)로 브랜드를 인식하고 조회를 자동 라우팅합니다.",
    },
    {
      name: "디코딩된 공장 출고 기록 확인",
      text: "섀시, 모델 연식, 엔진, 도장, 공장, 공장 옵션(SA 코드), 일치하는 사용 설명서를 표시합니다. 각 탭에는 출처 배지가 있어 BMW 공식 데이터인지 보조 디코더인지 확인할 수 있습니다.",
    },
    {
      name: "이 VIN에 맞는 OEM 부품 보기",
      text: "「bmv.parts에서 OEM 부품 구매」를 눌러 해당 섀시로 필터링된 bmv.parts 카탈로그로 이동하세요.",
    },
  ],
  facetPaginationLabel: ({ page, total }) => `${total}페이지 중 ${page}페이지`,
  facetPaginationPrev: "← 이전",
  facetPaginationNext: "다음 →",
  facetCrossRailHeading: kind => `이 그룹의 다른 ${kind}`,
  facetThinCohortNote: cohort =>
    `이 그룹에는 디코딩된 VIN이 ${cohort}건뿐 — 표본이 늘어날 때까지 검색엔진에서 페이지가 숨겨집니다.`,
  vinTokenHeading: "이 VIN의 의미",
  vinTokenIntro:
    "BMW VIN은 모두 17자리이며 세 섹션으로 나뉩니다. 라벨에 마우스를 올리거나 탭하면 용어집 항목이 표시됩니다.",
  vinTokenWmiLabel: "WMI",
  vinTokenWmiHint: "World Manufacturer Identifier (1–3번 자리) — 제조사와 지역을 식별.",
  vinTokenVdsLabel: "VDS",
  vinTokenVdsHint: "Vehicle Descriptor Section (4–8번 자리) — 모델, 차체, 안전구속장치.",
  vinTokenCheckLabel: "체크 디지트",
  vinTokenCheckHint: "9번 자리 — 단일 문자 입력 오류를 잡아내는 ISO 3779 체크섬.",
  vinTokenMyLetterLabel: "모델 연식",
  vinTokenMyLetterHint: year =>
    year ? `10번 자리 — 문자가 모델 연식을 인코딩 (${year}).` : "10번 자리 — 문자가 모델 연식을 인코딩.",
  vinTokenPlantLabel: "공장",
  vinTokenPlantHint: city =>
    city ? `11번 자리 — 한 문자가 조립 공장을 식별 (${city}).` : "11번 자리 — 한 문자가 조립 공장을 식별.",
  vinTokenSerialLabel: "일련번호",
  vinTokenSerialHint: "12–17번 자리 — 생산 순서대로 부여된 일련번호.",
};

// =============================================================================
// Attach to packs.
// =============================================================================
deDEPack.vinHost = deDEVinHost;
frFRPack.vinHost = frFRVinHost;
esESPack.vinHost = esESVinHost;
esMXPack.vinHost = esMXVinHost;
itITPack.vinHost = itITVinHost;
ptBRPack.vinHost = ptBRVinHost;
enZAPack.vinHost = enZAVinHost;
ruRUPack.vinHost = ruRUVinHost;
zhCNPack.vinHost = zhCNVinHost;
koKRPack.vinHost = koKRVinHost;

export const VIN_HOST_BY_LOCALE = {
  en: enVinHost,
  "de-DE": deDEVinHost,
  "fr-FR": frFRVinHost,
  "es-ES": esESVinHost,
  "es-MX": esMXVinHost,
  "it-IT": itITVinHost,
  "pt-BR": ptBRVinHost,
  "en-ZA": enZAVinHost,
  "ru-RU": ruRUVinHost,
  "zh-CN": zhCNVinHost,
  "ko-KR": koKRVinHost,
} as const;
