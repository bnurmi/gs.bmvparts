// German (de-DE) locale pack.

import { makePack } from "./builder";
import { defaultYearRange } from "./types";

export const deDEPack = makePack({
  meta: {
    code: "de-DE",
    prefix: "de",
    bcp47: "de-DE",
    nativeLabel: "Deutsch",
    currency: "EUR",
    regionHint: "Preise & Verfügbarkeit für Deutschland",
  },
  conjAnd: "und",
  conjOr: "oder",
  nouns: {
    engine: "Motorbauteil",
    cooling: "Kühlsystem-Bauteil",
    brake: "Bremsen-Bauteil",
    suspension: "Fahrwerks- bzw. Aufhängungsbauteil",
    fuel: "Kraftstoffsystem-Bauteil",
    exhaust: "Abgasanlagen-Bauteil",
    electrical: "Elektrik-Bauteil",
    drivetrain: "Antriebsstrang-Bauteil",
    body: "Karosserie- bzw. Innenraumbauteil",
    climate: "Klimasystem-Bauteil",
    fallback: "BMW Bauteil",
    wrap: c => `${c}-Bauteil`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `Original BMW ${desc} (Teilenummer ${partNum}) ist ein OEM-${noun}.`,
    chassisClause: ({ chassisList, multiple }) =>
      `Verwendet in den Karosseriereihen ${chassisList}${multiple ? " (mehrere Plattformen)" : ""}.`,
    fitmentClause: ({ models }) =>
      `Bestätigte Passgenauigkeit u. a. für ${models}`,
    yearsClause: ({ years }) => `, Modelljahre ${years}.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `Dieses Teil wurde durch ${supersededBy} ersetzt; bei Bestellung von ${partNum} wird in der Regel die aktuelle Revision geliefert.`,
  },
  fitment: {
    none: "Für dieses Teil liegen noch keine geprüften Passungsdaten vor.",
    alsoReferenced: ch => `wird auch für die Karosserie ${ch} geführt`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}: ${topModels}`;
      if (extraCount > 0) s += ` und ${extraCount} weitere`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: "; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "OEM-Teilenummer",
    searchNumber: "Suchnummer",
    weight: kg => ({ label: "Gewicht", value: `${kg} kg` }),
    quantity: "Übliche Stückzahl pro Fahrzeug",
    position: "Einbauposition",
    catalogCategory: "Katalogkategorie",
    catalogPath: "Katalogpfad",
    supersededBy: "Ersetzt durch",
    replaces: "Ersetzt",
    notes: "Hinweise",
  },
  faq: {
    whichModels: {
      q: pn => `Welche BMW-Modelle verwenden Teil ${pn}?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `Teil ${partNum} passt für ${models}${extra > 0 ? `, sowie ${extra} weitere Variante${extra > 1 ? "n" : ""}` : ""} und deckt die Karosserie${multiChassis ? "reihen" : "reihe"} ${chassisText} ab.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `Teil ${partNum} erscheint in den BMW-Katalogen für die Karosserie ${chassisText}.`,
      andMore: n => `(und ${n} weitere)`,
    },
    superseded: {
      q: pn => `Wurde BMW-Teil ${pn} ersetzt?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `Ja — BMW ersetzt ${partNum} durch ${supersededBy}. Bei Bestellung der ursprünglichen Nummer wird automatisch die aktuelle Revision geliefert.`,
      aActive: pn =>
        `BMW listet ${pn} derzeit als aktive OEM-Nummer. Sollte BMW eine Ersetzung herausgeben, wird ${pn} bei Bestellung über den Händler automatisch durch die aktuellste Revision ersetzt.`,
    },
    weight: {
      q: pn => `Wie schwer ist Teil ${pn}?`,
      a: ({ partNum, desc, kg }) =>
        `Die BMW-Katalogdaten geben für ${desc} (${partNum}) ein Versandgewicht von ca. ${kg} kg an.`,
    },
    location: {
      q: ({ desc, partNum }) => `Wo befindet sich ${desc} (${partNum}) am Fahrzeug?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} ist in den BMW-Teilezeichnungen unter „${category} › ${subcategory}" katalogisiert. Die Explosionszeichnung zeigt die genaue Einbauposition und die benachbarten Bauteile.`,
    },
    oemEquivalent: {
      q: pn => `Was ist das OEM-Äquivalent zu ${pn}?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} ist selbst die BMW-OEM-Originalteilenummer. Aftermarket-Äquivalente von Herstellern wie Mahle, Bosch, Pierburg oder Hella sind häufig erhältlich; verwenden Sie ${partNumberClean} als Referenz für Nicht-OEM-Marken.`,
    },
    quantity: {
      q: pn => `Wie viele Stück von Teil ${pn} sind pro Fahrzeug verbaut?`,
      a: ({ quantity }) =>
        `Der BMW-Katalog gibt für dieses Teil eine typische Stückzahl von ${quantity} pro Fahrzeug über die gelisteten Passungen an.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — Passt für ${chassisCodes}`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `Original BMW OEM ${desc} (${partNum})`;
      if (chassisCodes) s += ` für ${chassisCodes}`;
      s += `. ${fitCount > 0 ? `Bestätigt in ${fitCount} BMW-Modellvariante${fitCount !== 1 ? "n" : ""}` : "BMW-OEM-Teil"}, mit Zeichnungen, Ersatzdaten und Preisen.`;
      return s;
    },
    titleMaxChars: 70,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `Die BMW ${label}-Karosseriereihe umfasst ${carCount} Werksvariante${carCount === 1 ? "" : "n"}`;
      if (series) s += ` der ${series}-Familie`;
      if (years) s += ` (${years})`;
      s += `, mit ${totalPartsFmt} OEM-Teilen, katalogisiert in Explosionszeichnungen.`;
      if (topCategoryNames.length > 0) {
        s += ` Besonders umfangreich sind ${topCategoryNames.slice(0, 4).join(", ")}.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `BMW ${label} Teile — OEM-Katalog`;
      if (years) t += ` (${years})`;
      if (t.length > 70) t = t.slice(0, 67) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `${totalPartsFmt} OEM-Teile für die BMW ${label}-Karosserie über ${carCount} Modellvariante${carCount === 1 ? "" : "n"}. Original-BMW-Teilenummern, Zeichnungen, Ersatzdaten und Querverweise.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `Welche BMW-Modelle teilen sich die ${label}-Karosserie?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `Die BMW ${label}-Karosserie umfasst ${carCount} Werksvariante${carCount === 1 ? "" : "n"}${series ? ` aus der ${series}-Familie` : ""}${years ? `, gebaut ${years}` : ""}. Die Modellliste unten zeigt Motor, Karosserietyp und Baujahre jeder Variante.`,
      partsCountQ: label => `Wie viele BMW ${label}-Teile sind katalogisiert?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts indexiert ${totalPartsFmt} OEM-Teilenummern für die ${label}-Karosserie, basierend auf dem offiziellen BMW-ETK-Katalog und abgeglichen mit PartsLink24.`,
      topCategoriesQ: label => `Welche ${label}-Kategorien haben die größte Abdeckung?`,
      topCategoriesA: ({ label, topList }) =>
        `Die größten Kategorien für die ${label}-Karosserie nach indexierter Teilezahl sind: ${topList}.`,
      relatedQ: label => `Welche anderen BMW-Karosserien sind mit der ${label} verwandt?`,
      relatedA: ({ siblings }) =>
        `Eng verwandte BMW-Karosserien zum Stöbern: ${siblings}.`,
      findRightPartQ: label => `Wie finde ich das richtige BMW ${label}-Teil für mein Fahrzeug?`,
      findRightPartA: () =>
        `Wählen Sie unten Ihr genaues Modell, um in dessen Katalog einzusteigen, oder nutzen Sie den VIN-Decoder, um Teile Ihrem konkreten Fahrzeug zuzuordnen. Jede Teileseite enthält Passungen, Ersatzdaten und Querverweise zu OEM-äquivalenten Lieferanten.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `${displayName} Teilekatalog — OEM-Teile & Zeichnungen`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt} ` : ""}OEM-Teile für den BMW ${displayName} (${chassis}). Explosionszeichnungen, Teilenummern und Querverweise für ${modelName}${engine ? ` ${engine}` : ""}.`.trim(),
  },
  formatYearRange: defaultYearRange,
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `Der BMW ${label}-Teilekatalog umfasst ${carCount} Werksvariante${carCount === 1 ? "" : "n"}`;
        if (chassisCodes.length > 0) {
          s += ` über ${chassisCodes.length} Karosseriegeneration${chassisCodes.length === 1 ? "" : "en"} (${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `, mit ${totalPartsFmt} Original-BMW-Teilenummern, abrufbar nach FIN, Zeichnung oder Teilenummer.`;
        if (topCategoryNames.length > 0) {
          s += ` Häufig durchsucht: ${topCategoryNames.slice(0, 4).join(", ")}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `BMW ${label} Teilekatalog — Alle Generationen`;
        if (years) t += ` (${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `Kompletter BMW ${label}-Teilekatalog — ${totalPartsFmt} OEM-Teile über ${carCount} Modellvariante${carCount === 1 ? "" : "n"}`;
        if (chassisCodes.length > 0) {
          s += ` und ${chassisCodes.length} Karosseriegeneration${chassisCodes.length === 1 ? "" : "en"}`;
        }
        s += `. Original-BMW-Teilenummern, Zeichnungen, Ersatzdaten und Querverweise.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `Welche Karosseriegenerationen gehören zur BMW ${label}?`,
        chassisInSeriesA: ({ label, count, list }) => `Die BMW ${label} umfasst ${count} Karosseriegeneration${count === 1 ? "" : "en"}: ${list}.`,
        partsCountQ: label => `Wie viele BMW ${label}-Teile sind katalogisiert?`,
        partsCountA: ({ label, totalPartsFmt }) => `${totalPartsFmt} eindeutige OEM-Teilenummern sind für die BMW-${label}-Reihe katalogisiert, mit Zeichnungen, Passungsdaten, Gewicht und Ersetzungsverfolgung.`,
        topCategoriesQ: label => `Welche ${label}-Kategorien haben die meisten Teile?`,
        topCategoriesA: ({ topList }) => `Nach indexierter Teilezahl sind die größten BMW-Kategorien: ${topList}.`,
        findRightPartQ: label => `Wie finde ich das richtige BMW ${label}-Teil für mein Auto?`,
        findRightPartA: () => `Wählen Sie unten Ihr genaues Modell, um in dessen Katalog einzusteigen, oder nutzen Sie den FIN-Decoder. Jede Teileseite enthält Passungen, Ersatzdaten und Querverweise zu OEM-äquivalenten Lieferanten.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `Vollständige Datenbank der BMW-Modellvarianten — ${totalModelsFmt} Modelle über alle Karosseriecodes hinweg, mit Motor, Karosserietyp und Baujahren für jeden Eintrag.`,
      metaTitle: () => `BMW Modelldatenbank — Alle Karosseriecodes & Generationen`,
      metaDescription: ({ totalModelsFmt }) => `Vollständige BMW-Modellreferenz-Datenbank — ${totalModelsFmt} Varianten über alle Karosseriecodes, Motoren und Generationen. Technische Daten zu allen BMW-Modellen, klassisch bis aktuell.`,
    },
    modelsHubUi: {
      pageTitle: "BMW Modellreferenz",
      databaseLabel: "Modelldatenbank",
      status: { ready: "Bereit", syncing: "Wird synchronisiert...", complete: "Abgeschlossen", error: "Fehler" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `Karosserien werden erfasst ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} Modelle`,
      errorsCount: n => `${n} Fehler`,
      buttons: {
        cancel: "Abbrechen",
        refresh: "Aktualisieren",
        syncModels: "Modelle synchronisieren",
        importing: "Wird importiert...",
        importLegacy: "Klassiker importieren",
      },
      importLegacyTooltip: "Importiert kuratierte ältere Karosserien (E36/E39/E46/E60/E83/E87/E90/F15), die bimmer.work nicht führt",
      searchPlaceholder: "Modelle, Karosseriecodes, Motoren suchen...",
      resultsBadge: n => `${n} Ergebnisse`,
      filterAll: "Alle",
      showLess: "Weniger",
      showMore: n => `+${n} weitere`,
      failedToLoad: "Modelle konnten nicht geladen werden.",
      emptyTitle: "Keine Modelle in der Datenbank",
      emptyHintWithSearch: "Keine Modelle passen zu Ihrer Suche. Versuchen Sie eine andere Anfrage.",
      emptyHintNoSearch: 'Klicken Sie oben auf „Modelle synchronisieren", um alle 1.350+ BMW-Modellvarianten zu importieren.',
      variantsCount: n => `${n} Varianten`,
    },
    hubLabels: {
      breadcrumbs: { home: "Startseite", series: "Baureihe", chassis: "Karosserie", models: "Modelle" },
      stats: {
        models: "Modelle",
        generations: "Generationen",
        totalParts: "Teile insgesamt",
        bodyTypes: "Karosserietypen",
        withPartsData: "Mit Teiledaten",
        parts: "Teile",
      },
      sections: {
        mostStockedCategories: (label) => `Meist bevorratete ${label}-Kategorien`,
        chassisInThisSeries: "Karosserien dieser Baureihe",
        relatedChassis: "Verwandte BMW-Karosserien",
        frequentlyAskedQuestions: "Häufig gestellte Fragen",
        allModelsHeading: ({ label, count }) => `Alle ${label}-Modelle (${count})`,
        bodyTypesLabel: "Karosserietypen:",
        enginesLabel: "Motoren:",
        moreEngines: (n) => `+${n} weitere`,
        productionYears: (years) => `Baujahre: ${years}`,
        modelsCount: (n) => `${n} Modell${n === 1 ? "" : "e"}`,
        partsLowercase: "Teile",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount} Modell${carCount === 1 ? "" : "e"} · ${totalParts} Teile`,
        browse: "Ansehen",
      },
      notFound: {
        seriesHeading: "Baureihe nicht gefunden",
        seriesMessage: (slug) => `Die Baureihe „${slug}" wurde nicht gefunden.`,
        seriesMetaTitle: "BMW Baureihe nicht gefunden",
        backToHome: "Zur Startseite",
        chassisHeading: "Karosserie nicht gefunden",
        chassisMessage: (label) => `Keine BMW-Modelle mit Karosseriecode „${label}" gefunden.`,
        chassisMetaTitle: (label) => `BMW ${label} Teile`,
        chassisMetaDescription: (label) => `BMW ${label} OEM-Teilekatalog durchsuchen.`,
        back: "Zurück",
      },
    },
    vinLanding: {
      breadcrumbHome: "Startseite",
      breadcrumbVinDecoder: "VIN-Decoder",
      vehicleSummary: "Fahrzeugübersicht",
      vehiclePhotos: "Fahrzeugfotos",
      ownersManuals: n => `Bordbücher (${n})`,
      factoryOptions: n => `Werksausstattung (${n})`,
      bmwOemPartsCatalog: "BMW OEM-Teilekatalog",
      factVin: "VIN",
      factChassis: "Chassis",
      factModelYear: "Modelljahr",
      factEngine: "Motor",
      factDrivetrain: "Antrieb",
      factTransmission: "Getriebe",
      factMarket: "Markt",
      factPaint: "Lackierung",
      factUpholstery: "Polster",
      factBuildDate: "Baudatum",
      factPlant: "Werk",
      exteriorCaption: "Außen",
      interiorCaption: "Innen",
      exteriorAlt: ({ headline, vin }) => `Außenansicht von ${headline}, FIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `Innenansicht von ${headline}, FIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `360°-Außenansicht von ${headline}, FIN ${vin}`,
      viewer360NoscriptCaption: n => `360°-Außenansicht (${n} Frames mit aktiviertem JavaScript verfügbar)`,
      viewer360HydrationHint: n => `360°-Drehansicht (${n} Frames) wird nach dem Laden von JavaScript angezeigt.`,
      manualHeaderManual: "Handbuch",
      manualHeaderNumber: "Nummer",
      manualHeaderLanguage: "Sprache",
      manualHeaderDate: "Datum",
      catalogIntro: "Durchsuchen Sie OEM-Teile für diesen BMW. Diagramme, Teilenummern, Passgenauigkeit und Querverweise sind nach Systemgruppen geordnet.",
      chassisLink: chassis => `OEM-Teile für die BMW ${chassis} Karosserie durchsuchen`,
      seriesLink: series => `BMW ${series} Reihe entdecken`,
      decodeAnotherLink: "Weitere BMW-FIN entschlüsseln",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "Erstanbieter-Katalog";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "BMW Bordbücher";
          case "bimmerwork": return "bimmer.work (Fallback)";
          case "mdecoder": return "mdecoder (Fallback)";
          case "vindecoderz": return "vindecoderz (Fallback)";
          default: return null;
        }
      },
      preparingTitle: vin => `FIN ${vin} wird vorbereitet… | BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts ruft den BMW-Werksdatensatz für FIN ${vin} ab: Fahrzeugdaten, Fotos, Werksausstattung und Bordbücher. Bitte in Kürze neu laden, um die vollständige Landing-Page zu sehen.`,
      preparingHeading: vin => `FIN ${vin} wird vorbereitet…`,
      preparingBody:
        "Wir entschlüsseln diese BMW-FIN über unsere Erstanbieter-Quellen. Fahrzeugfotos, Werksausstattung und Bordbücher erscheinen hier, sobald die Abfrage abgeschlossen ist – meist innerhalb einer Minute.",
      preparingFooterLinkText: vin => `VIN-Decoder für ${vin} öffnen`,
      notFoundTitle: vin => `FIN ${vin} nicht gefunden | BMV.parts`,
      notFoundReasonInvalid: "Diese FIN ist strukturell ungültig (falsche Länge oder ungültige Prüfziffer).",
      notFoundReasonNotBmw: "Diese FIN gehört nicht zu einem BMW (das WMI-Präfix entspricht keinem BMW-Herstellercode).",
      notFoundReasonUncached: "Für diese FIN liegt noch kein entschlüsselter Datensatz vor.",
    },
  });
