// French (fr-FR) locale pack.

import { makePack } from "./builder";
import { defaultYearRange } from "./types";

export const frFRPack = makePack({
  meta: {
    code: "fr-FR",
    prefix: "fr",
    bcp47: "fr-FR",
    nativeLabel: "Français",
    currency: "EUR",
    regionHint: "Tarifs et disponibilité pour la France",
  },
  conjAnd: "et",
  conjOr: "ou",
  nouns: {
    engine: "composant moteur",
    cooling: "composant du circuit de refroidissement",
    brake: "composant de freinage",
    suspension: "élément de châssis / suspension",
    fuel: "composant du circuit de carburant",
    exhaust: "composant d'échappement",
    electrical: "composant électrique",
    drivetrain: "composant de transmission",
    body: "élément de carrosserie / intérieur",
    climate: "composant de climatisation",
    fallback: "composant BMW",
    wrap: c => `composant ${c}`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `${desc} BMW d'origine (référence ${partNum}) est un ${noun} OEM.`,
    chassisClause: ({ chassisList, multiple }) =>
      `Utilisé sur les châssis ${chassisList}${multiple ? " (plusieurs plateformes)" : ""}.`,
    fitmentClause: ({ models }) =>
      `Compatibilité confirmée notamment avec les ${models}`,
    yearsClause: ({ years }) => `, années-modèles ${years}.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `Cette pièce a été remplacée par ${supersededBy} ; commander ${partNum} expédie normalement la dernière révision.`,
  },
  fitment: {
    none: "Aucune donnée de compatibilité vérifiée n'est disponible pour cette pièce.",
    alsoReferenced: ch => `également référencé pour le châssis ${ch}`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis} : ${topModels}`;
      if (extraCount > 0) s += ` et ${extraCount} de plus`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: " ; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "Référence OEM",
    searchNumber: "Numéro de recherche",
    weight: kg => ({ label: "Poids", value: `${kg} kg` }),
    quantity: "Quantité typique par véhicule",
    position: "Position",
    catalogCategory: "Catégorie du catalogue",
    catalogPath: "Chemin du catalogue",
    supersededBy: "Remplacé par",
    replaces: "Remplace",
    notes: "Notes",
  },
  faq: {
    whichModels: {
      q: pn => `Quels modèles BMW utilisent la pièce ${pn} ?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `La pièce ${partNum} équipe ${models}${extra > 0 ? `, ainsi que ${extra} autre${extra > 1 ? "s" : ""} variante${extra > 1 ? "s" : ""}` : ""}, couvrant ${multiChassis ? "les châssis" : "le châssis"} ${chassisText}.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `La pièce ${partNum} apparaît dans les catalogues BMW pour le châssis ${chassisText}.`,
      andMore: n => `(et ${n} de plus)`,
    },
    superseded: {
      q: pn => `La pièce BMW ${pn} a-t-elle été remplacée ?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `Oui — BMW remplace ${partNum} par ${supersededBy}. Commander la référence d'origine expédie automatiquement la révision actuelle.`,
      aActive: pn =>
        `BMW liste actuellement ${pn} comme une référence OEM active. Si BMW émet un remplacement, ${pn} sera automatiquement substituée par la dernière révision lors d'une commande chez un concessionnaire.`,
    },
    weight: {
      q: pn => `Quel est le poids de la pièce ${pn} ?`,
      a: ({ partNum, desc, kg }) =>
        `Les données catalogue BMW indiquent un poids d'expédition d'environ ${kg} kg pour ${desc} (${partNum}).`,
    },
    location: {
      q: ({ desc, partNum }) => `Où se trouve ${desc} (${partNum}) sur le véhicule ?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} est répertorié sous « ${category} › ${subcategory} » dans les schémas BMW. Consultez la vue éclatée pour la position exacte et les composants adjacents.`,
    },
    oemEquivalent: {
      q: pn => `Quel est l'équivalent OEM de ${pn} ?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} est elle-même la référence d'origine BMW (OEM). Des équivalents aftermarket de fournisseurs comme Mahle, Bosch, Pierburg ou Hella sont couramment disponibles ; utilisez ${partNumberClean} comme référence croisée pour les marques non OEM.`,
    },
    quantity: {
      q: pn => `Combien d'exemplaires de la pièce ${pn} sont montés par véhicule ?`,
      a: ({ quantity }) =>
        `Le catalogue BMW indique une quantité typique de ${quantity} par véhicule pour cette pièce sur les compatibilités listées.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — Compatible ${chassisCodes}`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `${desc} BMW OEM d'origine (${partNum})`;
      if (chassisCodes) s += ` pour ${chassisCodes}`;
      s += `. ${fitCount > 0 ? `Confirmée sur ${fitCount} variante${fitCount !== 1 ? "s" : ""} BMW` : "Pièce OEM BMW"}, avec schémas, données de remplacement et tarifs.`;
      return s;
    },
    titleMaxChars: 70,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `Le châssis BMW ${label} regroupe ${carCount} variante${carCount === 1 ? "" : "s"} d'usine`;
      if (series) s += ` au sein de la famille ${series}`;
      if (years) s += ` (${years})`;
      s += `, avec ${totalPartsFmt} pièces OEM cataloguées dans des vues éclatées.`;
      if (topCategoryNames.length > 0) {
        s += ` Le catalogue est particulièrement fourni en ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `Pièces BMW ${label} — Catalogue OEM`;
      if (years) t += ` (${years})`;
      if (t.length > 70) t = t.slice(0, 67) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `Parcourez ${totalPartsFmt} pièces OEM pour le châssis BMW ${label} sur ${carCount} variante${carCount === 1 ? "" : "s"}. Numéros de pièces BMW d'origine, schémas, données de remplacement et références croisées.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `Quels modèles BMW partagent le châssis ${label} ?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `Le châssis BMW ${label} regroupe ${carCount} variante${carCount === 1 ? "" : "s"} d'usine${series ? ` dans la famille ${series}` : ""}${years ? `, produites ${years}` : ""}. Consultez la liste des modèles ci-dessous pour le moteur, la carrosserie et les années de production de chaque variante.`,
      partsCountQ: label => `Combien de pièces BMW ${label} sont cataloguées ?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts indexe ${totalPartsFmt} numéros de pièces OEM pour le châssis ${label}, issus du catalogue officiel BMW ETK et croisés avec PartsLink24.`,
      topCategoriesQ: label => `Quelles catégories ${label} ont la couverture la plus complète ?`,
      topCategoriesA: ({ label, topList }) =>
        `Les plus grandes catégories du châssis ${label} en nombre de pièces indexées sont : ${topList}.`,
      relatedQ: label => `Quels autres châssis BMW sont liés au ${label} ?`,
      relatedA: ({ siblings }) =>
        `Châssis BMW étroitement liés à explorer également : ${siblings}.`,
      findRightPartQ: label => `Comment trouver la bonne pièce BMW ${label} pour ma voiture ?`,
      findRightPartA: () =>
        `Choisissez votre modèle exact ci-dessous pour accéder à son catalogue, ou utilisez le décodeur VIN pour associer les pièces à votre véhicule. Chaque fiche pièce indique les compatibilités, les remplacements et les références croisées vers les fournisseurs équivalents OEM.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `Catalogue de pièces ${displayName} — Pièces OEM & schémas`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt} ` : ""}pièces OEM pour la BMW ${displayName} (${chassis}). Vues éclatées, numéros de pièces et références croisées pour ${modelName}${engine ? ` ${engine}` : ""}.`.trim(),
  },
  formatYearRange: defaultYearRange,
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `Le catalogue de pièces BMW ${label} couvre ${carCount} variante${carCount === 1 ? "" : "s"} d'usine`;
        if (chassisCodes.length > 0) {
          s += ` sur ${chassisCodes.length} génération${chassisCodes.length === 1 ? "" : "s"} de châssis (${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `, avec ${totalPartsFmt} numéros de pièces BMW d'origine consultables par VIN, schéma ou référence.`;
        if (topCategoryNames.length > 0) {
          s += ` Sections les plus consultées : ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `Catalogue de pièces BMW ${label} — Toutes générations`;
        if (years) t += ` (${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `Parcourez le catalogue BMW ${label} complet — ${totalPartsFmt} pièces OEM sur ${carCount} variante${carCount === 1 ? "" : "s"}`;
        if (chassisCodes.length > 0) {
          s += ` et ${chassisCodes.length} génération${chassisCodes.length === 1 ? "" : "s"} de châssis`;
        }
        s += `. Numéros de pièces BMW d'origine, schémas, données de remplacement et références croisées.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `Quelles générations de châssis appartiennent à la BMW ${label} ?`,
        chassisInSeriesA: ({ label, count, list }) => `La BMW ${label} couvre ${count} génération${count === 1 ? "" : "s"} de châssis : ${list}.`,
        partsCountQ: label => `Combien de pièces BMW ${label} sont cataloguées sur BMV.parts ?`,
        partsCountA: ({ label, totalPartsFmt }) => `${totalPartsFmt} numéros de pièces OEM uniques sont catalogués pour la gamme BMW ${label}, avec schémas, compatibilités, poids et suivi des remplacements.`,
        topCategoriesQ: label => `Quelles catégories ${label} comptent le plus de pièces ?`,
        topCategoriesA: ({ topList }) => `Selon le nombre de pièces indexées, les plus grandes catégories BMW sont : ${topList}.`,
        findRightPartQ: label => `Comment trouver la bonne pièce BMW ${label} pour ma voiture ?`,
        findRightPartA: () => `Sélectionnez votre modèle exact ci-dessous pour parcourir son catalogue, ou utilisez le décodeur VIN. Chaque fiche pièce indique les compatibilités, les remplacements et les références croisées vers les fournisseurs équivalents OEM.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `Base de données complète des variantes BMW — ${totalModelsFmt} modèles couvrant tous les codes châssis, avec moteur, carrosserie et années de production pour chaque entrée.`,
      metaTitle: () => `Base de données des modèles BMW — Tous les codes châssis et générations`,
      metaDescription: ({ totalModelsFmt }) => `Base de données complète de référence des modèles BMW — ${totalModelsFmt} variantes couvrant chaque code châssis, moteur et génération. Caractéristiques techniques de tous les modèles BMW, du classique à l'actuel.`,
    },
    modelsHubUi: {
      pageTitle: "Référence des modèles BMW",
      databaseLabel: "Base de données des modèles",
      status: { ready: "Prêt", syncing: "Synchronisation...", complete: "Terminé", error: "Erreur" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `Découverte des châssis ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} modèles`,
      errorsCount: n => `${n} erreurs`,
      buttons: {
        cancel: "Annuler",
        refresh: "Actualiser",
        syncModels: "Synchroniser les modèles",
        importing: "Importation...",
        importLegacy: "Importer le legacy",
      },
      importLegacyTooltip: "Importer les anciens châssis sélectionnés (E36/E39/E46/E60/E83/E87/E90/F15) que bimmer.work n'héberge pas",
      searchPlaceholder: "Rechercher modèles, codes châssis, moteurs...",
      resultsBadge: n => `${n} résultats`,
      filterAll: "Tous",
      showLess: "Moins",
      showMore: n => `+${n} de plus`,
      failedToLoad: "Impossible de charger les modèles.",
      emptyTitle: "Aucun modèle dans la base de données",
      emptyHintWithSearch: "Aucun modèle ne correspond à votre recherche. Essayez une autre requête.",
      emptyHintNoSearch: "Cliquez sur « Synchroniser les modèles » ci-dessus pour importer les 1 350+ variantes de modèles BMW.",
      variantsCount: n => `${n} variantes`,
    },
    hubLabels: {
      breadcrumbs: { home: "Accueil", series: "Série", chassis: "Châssis", models: "Modèles" },
      stats: {
        models: "Modèles",
        generations: "Générations",
        totalParts: "Total pièces",
        bodyTypes: "Carrosseries",
        withPartsData: "Avec données pièces",
        parts: "Pièces",
      },
      sections: {
        mostStockedCategories: (label) => `Catégories ${label} les mieux référencées`,
        chassisInThisSeries: "Châssis de cette série",
        relatedChassis: "Châssis BMW associés",
        frequentlyAskedQuestions: "Questions fréquentes",
        allModelsHeading: ({ label, count }) => `Tous les modèles ${label} (${count})`,
        bodyTypesLabel: "Carrosseries :",
        enginesLabel: "Moteurs :",
        moreEngines: (n) => `+${n} de plus`,
        productionYears: (years) => `Années de production : ${years}`,
        modelsCount: (n) => `${n} modèle${n === 1 ? "" : "s"}`,
        partsLowercase: "pièces",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount} modèle${carCount === 1 ? "" : "s"} · ${totalParts} pièces`,
        browse: "Parcourir",
      },
      notFound: {
        seriesHeading: "Série introuvable",
        seriesMessage: (slug) => `La série « ${slug} » est introuvable.`,
        seriesMetaTitle: "Série BMW introuvable",
        backToHome: "Retour à l'accueil",
        chassisHeading: "Châssis introuvable",
        chassisMessage: (label) => `Aucun modèle BMW trouvé pour le code châssis « ${label} ».`,
        chassisMetaTitle: (label) => `Pièces BMW ${label}`,
        chassisMetaDescription: (label) => `Parcourez le catalogue OEM BMW ${label}.`,
        back: "Retour",
      },
    },
    vinLanding: {
      breadcrumbHome: "Accueil",
      breadcrumbVinDecoder: "Décodeur VIN",
      vehicleSummary: "Résumé du véhicule",
      vehiclePhotos: "Photos du véhicule",
      ownersManuals: n => `Manuels du propriétaire (${n})`,
      factoryOptions: n => `Options d'usine (${n})`,
      bmwOemPartsCatalog: "Catalogue de pièces OEM BMW",
      factVin: "VIN",
      factChassis: "Châssis",
      factModelYear: "Année modèle",
      factEngine: "Moteur",
      factDrivetrain: "Transmission intégrale",
      factTransmission: "Boîte de vitesses",
      factMarket: "Marché",
      factPaint: "Peinture",
      factUpholstery: "Sellerie",
      factBuildDate: "Date de fabrication",
      factPlant: "Usine",
      exteriorCaption: "Extérieur",
      interiorCaption: "Intérieur",
      exteriorAlt: ({ headline, vin }) => `Extérieur de ${headline}, VIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `Intérieur de ${headline}, VIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `Vue extérieure 360° de ${headline}, VIN ${vin}`,
      viewer360NoscriptCaption: n => `Vue extérieure 360° (${n} images disponibles avec JavaScript activé)`,
      viewer360HydrationHint: n => `La visionneuse 360° (${n} images) s'affichera après l'hydratation JavaScript.`,
      manualHeaderManual: "Manuel",
      manualHeaderNumber: "Numéro",
      manualHeaderLanguage: "Langue",
      manualHeaderDate: "Date",
      catalogIntro: "Parcourez les pièces OEM pour cette BMW. Schémas, références, compatibilités et équivalences sont organisés par groupe système.",
      chassisLink: chassis => `Parcourir les pièces OEM pour le châssis BMW ${chassis}`,
      seriesLink: series => `Découvrir la série BMW ${series}`,
      decodeAnotherLink: "Décoder un autre VIN BMW",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "Catalogue propriétaire";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "Manuels du propriétaire BMW";
          case "bimmerwork": return "bimmer.work (secours)";
          case "mdecoder": return "mdecoder (secours)";
          case "vindecoderz": return "vindecoderz (secours)";
          default: return null;
        }
      },
      preparingTitle: vin => `Préparation du VIN ${vin}… | BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts récupère le dossier d'usine BMW pour le VIN ${vin} : données véhicule, photos, options d'usine et manuels du propriétaire. Actualisez dans un instant pour voir la page complète.`,
      preparingHeading: vin => `Préparation du VIN ${vin}…`,
      preparingBody:
        "Nous décodons ce VIN BMW à partir de nos sources propriétaires. Les photos, options d'usine et manuels apparaîtront ici dès que la recherche sera terminée — généralement en moins d'une minute.",
      preparingFooterLinkText: vin => `Ouvrir le décodeur VIN pour ${vin}`,
      notFoundTitle: vin => `VIN ${vin} introuvable | BMV.parts`,
      notFoundReasonInvalid: "Ce VIN n'est pas structurellement valide (longueur incorrecte ou clé de contrôle invalide).",
      notFoundReasonNotBmw: "Ce VIN ne correspond pas à une BMW (le préfixe WMI ne correspond à aucun code constructeur BMW).",
      notFoundReasonUncached: "Aucun enregistrement décodé n'est encore disponible pour ce VIN.",
    },
  });
