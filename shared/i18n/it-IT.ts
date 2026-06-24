// Italian (it-IT) locale pack.

import { makePack } from "./builder";
import { defaultYearRange } from "./types";

export const itITPack = makePack({
  meta: {
    code: "it-IT",
    prefix: "it",
    bcp47: "it-IT",
    nativeLabel: "Italiano",
    currency: "EUR",
    regionHint: "Prezzi e disponibilità per l'Italia",
  },
  conjAnd: "e",
  conjOr: "o",
  nouns: {
    engine: "componente del motore",
    cooling: "componente dell'impianto di raffreddamento",
    brake: "componente dell'impianto frenante",
    suspension: "componente di telaio/sospensioni",
    fuel: "componente dell'impianto di alimentazione",
    exhaust: "componente dell'impianto di scarico",
    electrical: "componente elettrico",
    drivetrain: "componente della trasmissione",
    body: "componente carrozzeria/abitacolo",
    climate: "componente dell'impianto di climatizzazione",
    fallback: "componente BMW",
    wrap: c => `componente ${c}`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `${desc} BMW originale (codice ricambio ${partNum}) è un ${noun} OEM.`,
    chassisClause: ({ chassisList, multiple }) =>
      `Utilizzato sui telai ${chassisList}${multiple ? " (più piattaforme)" : ""}.`,
    fitmentClause: ({ models }) => `La compatibilità confermata include ${models}`,
    yearsClause: ({ years }) => `, anni-modello ${years}.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `Questo ricambio è stato sostituito da ${supersededBy}; ordinando ${partNum} viene normalmente spedita la revisione più recente.`,
  },
  fitment: {
    none: "Nessun dato di compatibilità verificato è ancora disponibile per questo ricambio.",
    alsoReferenced: ch => `anche referenziato per il telaio ${ch}`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}: ${topModels}`;
      if (extraCount > 0) s += ` e altri ${extraCount}`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: "; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "Codice ricambio OEM",
    searchNumber: "Numero di ricerca",
    weight: kg => ({ label: "Peso", value: `${kg} kg` }),
    quantity: "Quantità tipica per veicolo",
    position: "Posizione",
    catalogCategory: "Categoria a catalogo",
    catalogPath: "Percorso a catalogo",
    supersededBy: "Sostituito da",
    replaces: "Sostituisce",
    notes: "Note",
  },
  faq: {
    whichModels: {
      q: pn => `Quali modelli BMW utilizzano il ricambio ${pn}?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `Il ricambio ${partNum} si adatta a ${models}${extra > 0 ? `, oltre ad altre ${extra} variante${extra > 1 ? "i" : ""}` : ""}, coprendo ${multiChassis ? "i telai" : "il telaio"} ${chassisText}.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `Il ricambio ${partNum} compare nei cataloghi BMW per il telaio ${chassisText}.`,
      andMore: n => `(e altri ${n})`,
    },
    superseded: {
      q: pn => `Il ricambio BMW ${pn} è stato sostituito?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `Sì — BMW sostituisce ${partNum} con ${supersededBy}. Ordinando il numero originale viene normalmente spedita automaticamente la revisione attuale.`,
      aActive: pn =>
        `BMW elenca attualmente ${pn} come codice OEM attivo. In caso di sostituzione emessa da BMW, ${pn} sarà automaticamente sostituito con la revisione più recente al momento dell'ordine tramite concessionario.`,
    },
    weight: {
      q: pn => `Quanto pesa il ricambio ${pn}?`,
      a: ({ partNum, desc, kg }) =>
        `I dati a catalogo BMW indicano un peso di spedizione di circa ${kg} kg per ${desc} (${partNum}).`,
    },
    location: {
      q: ({ desc, partNum }) => `Dove si trova ${desc} (${partNum}) sull'auto?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} è catalogato sotto «${category} › ${subcategory}» nei disegni BMW. Consulta la vista esplosa per la posizione esatta di montaggio e i componenti adiacenti.`,
    },
    oemEquivalent: {
      q: pn => `Qual è l'equivalente OEM di ${pn}?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} è esso stesso il codice ricambio originale (OEM) BMW. Sono comunemente disponibili equivalenti aftermarket di marchi come Mahle, Bosch, Pierburg o Hella; usa ${partNumberClean} come riferimento incrociato per i marchi non OEM.`,
    },
    quantity: {
      q: pn => `Quanti pezzi del ricambio ${pn} sono montati per auto?`,
      a: ({ quantity }) =>
        `Il catalogo BMW indica una quantità tipica di ${quantity} per veicolo per questo ricambio sulle compatibilità elencate.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — Compatibile ${chassisCodes}`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `${desc} BMW OEM originale (${partNum})`;
      if (chassisCodes) s += ` per ${chassisCodes}`;
      s += `. ${fitCount > 0 ? `Confermato su ${fitCount} variante${fitCount !== 1 ? "i" : ""} BMW` : "Ricambio OEM BMW"}, con disegni, dati di sostituzione e prezzi.`;
      return s;
    },
    titleMaxChars: 70,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `Il telaio BMW ${label} comprende ${carCount} variante${carCount === 1 ? "" : "i"} di fabbrica`;
      if (series) s += ` nella famiglia ${series}`;
      if (years) s += ` (${years})`;
      s += `, con ${totalPartsFmt} ricambi OEM catalogati negli esplosi.`;
      if (topCategoryNames.length > 0) {
        s += ` Il catalogo è particolarmente ampio per ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `Ricambi BMW ${label} — Catalogo OEM`;
      if (years) t += ` (${years})`;
      if (t.length > 70) t = t.slice(0, 67) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `Sfoglia ${totalPartsFmt} ricambi OEM per il telaio BMW ${label} su ${carCount} variante${carCount === 1 ? "" : "i"}. Codici ricambio BMW originali, esplosi, dati di sostituzione e riferimenti incrociati.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `Quali modelli BMW condividono il telaio ${label}?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `Il telaio BMW ${label} include ${carCount} variante${carCount === 1 ? "" : "i"} di fabbrica${series ? ` nella famiglia ${series}` : ""}${years ? `, prodotte ${years}` : ""}. Consulta l'elenco modelli sotto per motore, carrozzeria e anni di produzione di ciascuna variante.`,
      partsCountQ: label => `Quanti ricambi BMW ${label} sono catalogati?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts indicizza ${totalPartsFmt} codici ricambio OEM per il telaio ${label}, dal catalogo ufficiale BMW ETK e con riferimenti incrociati a PartsLink24.`,
      topCategoriesQ: label => `Quali categorie ${label} hanno la copertura più ampia?`,
      topCategoriesA: ({ label, topList }) =>
        `Le categorie più ampie del telaio ${label} per numero di ricambi indicizzati sono: ${topList}.`,
      relatedQ: label => `Quali altri telai BMW sono correlati al ${label}?`,
      relatedA: ({ siblings }) =>
        `Telai BMW strettamente correlati da consultare: ${siblings}.`,
      findRightPartQ: label => `Come trovo il ricambio BMW ${label} giusto per la mia auto?`,
      findRightPartA: () =>
        `Seleziona il modello esatto qui sotto per accedere al suo catalogo, oppure usa il decodificatore VIN per associare i ricambi al tuo veicolo specifico. Ogni scheda ricambio mostra compatibilità, dati di sostituzione e riferimenti incrociati a fornitori equivalenti OEM.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `Catalogo ricambi ${displayName} — Ricambi OEM ed esplosi`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt} ` : ""}ricambi OEM per la BMW ${displayName} (${chassis}). Esplosi, codici ricambio e riferimenti incrociati per ${modelName}${engine ? ` ${engine}` : ""}.`.trim(),
  },
  formatYearRange: defaultYearRange,
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `Il catalogo ricambi BMW ${label} comprende ${carCount} variante${carCount === 1 ? "" : " di"} fabbrica`;
        if (chassisCodes.length > 0) {
          s += ` su ${chassisCodes.length} generazione${chassisCodes.length === 1 ? "" : "i"} di telaio (${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `, con ${totalPartsFmt} codici ricambio BMW originali consultabili per VIN, esploso o codice.`;
        if (topCategoryNames.length > 0) {
          s += ` Sezioni più consultate: ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `Catalogo ricambi BMW ${label} — Tutte le generazioni`;
        if (years) t += ` (${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `Sfoglia il catalogo BMW ${label} completo — ${totalPartsFmt} ricambi OEM su ${carCount} variante${carCount === 1 ? "" : " di vettura"}`;
        if (chassisCodes.length > 0) {
          s += ` e ${chassisCodes.length} generazione${chassisCodes.length === 1 ? "" : "i"} di telaio`;
        }
        s += `. Codici ricambio BMW originali, esplosi, dati di sostituzione e riferimenti incrociati.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `Quali generazioni di telaio appartengono alla BMW ${label}?`,
        chassisInSeriesA: ({ label, count, list }) => `La BMW ${label} copre ${count} generazione${count === 1 ? "" : "i"} di telaio: ${list}.`,
        partsCountQ: label => `Quanti ricambi BMW ${label} sono catalogati su BMV.parts?`,
        partsCountA: ({ label, totalPartsFmt }) => `${totalPartsFmt} codici ricambio OEM unici sono catalogati per la gamma BMW ${label}, con esplosi, dati di compatibilità, peso e tracciamento delle sostituzioni.`,
        topCategoriesQ: label => `Quali categorie ${label} hanno più ricambi?`,
        topCategoriesA: ({ topList }) => `Per numero di ricambi indicizzati, le categorie BMW più ampie sono: ${topList}.`,
        findRightPartQ: label => `Come trovo il ricambio BMW ${label} giusto per la mia auto?`,
        findRightPartA: () => `Scegli il modello esatto qui sotto per accedere al suo catalogo, oppure usa il decoder VIN. Ogni scheda ricambio elenca compatibilità, sostituzioni e riferimenti incrociati a fornitori equivalenti OEM.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `Database completo delle varianti BMW — ${totalModelsFmt} modelli in tutti i codici telaio, con motore, carrozzeria e anni di produzione per ogni voce.`,
      metaTitle: () => `Database modelli BMW — Tutti i codici telaio e le generazioni`,
      metaDescription: ({ totalModelsFmt }) => `Database di riferimento completo dei modelli BMW — ${totalModelsFmt} varianti su ogni codice telaio, motore e generazione. Caratteristiche tecniche di tutti i modelli BMW, dal classico all'attuale.`,
    },
    modelsHubUi: {
      pageTitle: "Riferimento modelli BMW",
      databaseLabel: "Database modelli",
      status: { ready: "Pronto", syncing: "Sincronizzazione...", complete: "Completato", error: "Errore" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `Rilevamento telai ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} modelli`,
      errorsCount: n => `${n} errori`,
      buttons: {
        cancel: "Annulla",
        refresh: "Aggiorna",
        syncModels: "Sincronizza modelli",
        importing: "Importazione...",
        importLegacy: "Importa storici",
      },
      importLegacyTooltip: "Importa telai storici selezionati (E36/E39/E46/E60/E83/E87/E90/F15) non presenti su bimmer.work",
      searchPlaceholder: "Cerca modelli, codici telaio, motori...",
      resultsBadge: n => `${n} risultati`,
      filterAll: "Tutti",
      showLess: "Meno",
      showMore: n => `+${n} altri`,
      failedToLoad: "Impossibile caricare i modelli.",
      emptyTitle: "Nessun modello nel database",
      emptyHintWithSearch: "Nessun modello corrisponde alla tua ricerca. Prova un'altra query.",
      emptyHintNoSearch: 'Fai clic su "Sincronizza modelli" sopra per importare tutte le oltre 1.350 varianti BMW.',
      variantsCount: n => `${n} varianti`,
    },
    hubLabels: {
      breadcrumbs: { home: "Home", series: "Serie", chassis: "Telaio", models: "Modelli" },
      stats: {
        models: "Modelli",
        generations: "Generazioni",
        totalParts: "Ricambi totali",
        bodyTypes: "Carrozzerie",
        withPartsData: "Con dati ricambi",
        parts: "Ricambi",
      },
      sections: {
        mostStockedCategories: (label) => `Categorie ${label} con più ricambi`,
        chassisInThisSeries: "Telai di questa serie",
        relatedChassis: "Telai BMW correlati",
        frequentlyAskedQuestions: "Domande frequenti",
        allModelsHeading: ({ label, count }) => `Tutti i modelli ${label} (${count})`,
        bodyTypesLabel: "Carrozzerie:",
        enginesLabel: "Motori:",
        moreEngines: (n) => `+${n} altri`,
        productionYears: (years) => `Anni di produzione: ${years}`,
        modelsCount: (n) => `${n} modell${n === 1 ? "o" : "i"}`,
        partsLowercase: "ricambi",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount} modell${carCount === 1 ? "o" : "i"} · ${totalParts} ricambi`,
        browse: "Esplora",
      },
      notFound: {
        seriesHeading: "Serie non trovata",
        seriesMessage: (slug) => `Impossibile trovare la serie "${slug}".`,
        seriesMetaTitle: "Serie BMW non trovata",
        backToHome: "Torna alla home",
        chassisHeading: "Telaio non trovato",
        chassisMessage: (label) => `Nessun modello BMW trovato con codice telaio "${label}".`,
        chassisMetaTitle: (label) => `Ricambi BMW ${label}`,
        chassisMetaDescription: (label) => `Esplora il catalogo OEM BMW ${label}.`,
        back: "Indietro",
      },
    },
    vinLanding: {
      breadcrumbHome: "Home",
      breadcrumbVinDecoder: "Decodificatore VIN",
      vehicleSummary: "Riepilogo veicolo",
      vehiclePhotos: "Foto del veicolo",
      ownersManuals: n => `Manuali del proprietario (${n})`,
      factoryOptions: n => `Optional di fabbrica (${n})`,
      bmwOemPartsCatalog: "Catalogo ricambi OEM BMW",
      factVin: "VIN",
      factChassis: "Telaio",
      factModelYear: "Anno modello",
      factEngine: "Motore",
      factDrivetrain: "Trazione",
      factTransmission: "Cambio",
      factMarket: "Mercato",
      factPaint: "Vernice",
      factUpholstery: "Tappezzeria",
      factBuildDate: "Data di costruzione",
      factPlant: "Stabilimento",
      exteriorCaption: "Esterno",
      interiorCaption: "Interno",
      exteriorAlt: ({ headline, vin }) => `Esterno di ${headline}, VIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `Interno di ${headline}, VIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `Vista esterna 360° di ${headline}, VIN ${vin}`,
      viewer360NoscriptCaption: n => `Vista esterna 360° (${n} fotogrammi disponibili con JavaScript attivato)`,
      viewer360HydrationHint: n => `Il visualizzatore 360° (${n} fotogrammi) si caricherà dopo l'idratazione di JavaScript.`,
      manualHeaderManual: "Manuale",
      manualHeaderNumber: "Numero",
      manualHeaderLanguage: "Lingua",
      manualHeaderDate: "Data",
      catalogIntro: "Sfoglia i ricambi OEM per questa BMW. Schemi, codici, compatibilità e riferimenti incrociati sono organizzati per gruppo di sistema.",
      chassisLink: chassis => `Sfoglia i ricambi OEM per il telaio BMW ${chassis}`,
      seriesLink: series => `Esplora la serie BMW ${series}`,
      decodeAnotherLink: "Decodifica un altro VIN BMW",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "Catalogo proprietario";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "Manuali del proprietario BMW";
          case "bimmerwork": return "bimmer.work (riserva)";
          case "mdecoder": return "mdecoder (riserva)";
          case "vindecoderz": return "vindecoderz (riserva)";
          default: return null;
        }
      },
      preparingTitle: vin => `Preparazione del VIN ${vin}… | BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts sta recuperando il record di fabbrica BMW per il VIN ${vin}: dati veicolo, foto, optional di fabbrica e manuali del proprietario. Aggiorna tra poco per vedere la pagina completa.`,
      preparingHeading: vin => `Preparazione del VIN ${vin}…`,
      preparingBody:
        "Stiamo decodificando questo VIN BMW dalle nostre fonti proprietarie. Foto, optional di fabbrica e manuali appariranno qui non appena la ricerca sarà completata — di solito entro un minuto.",
      preparingFooterLinkText: vin => `Apri il decodificatore VIN per ${vin}`,
      notFoundTitle: vin => `VIN ${vin} non trovato | BMV.parts`,
      notFoundReasonInvalid: "Questo VIN non è strutturalmente valido (lunghezza errata o cifra di controllo non valida).",
      notFoundReasonNotBmw: "Questo VIN non corrisponde a una BMW (il prefisso WMI non coincide con alcun codice produttore BMW).",
      notFoundReasonUncached: "Non abbiamo ancora un record decodificato per questo VIN.",
    },
  });
