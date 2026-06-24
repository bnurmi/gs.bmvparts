// Spanish (es-ES) locale pack.

import { makePack } from "./builder";
import { defaultYearRange } from "./types";

export const esESPack = makePack({
  meta: {
    code: "es-ES",
    prefix: "es",
    bcp47: "es-ES",
    nativeLabel: "Español",
    currency: "EUR",
    regionHint: "Precios y disponibilidad para España",
  },
  conjAnd: "y",
  conjOr: "o",
  nouns: {
    engine: "componente del motor",
    cooling: "componente del sistema de refrigeración",
    brake: "componente del sistema de frenos",
    suspension: "componente de chasis/suspensión",
    fuel: "componente del sistema de combustible",
    exhaust: "componente del sistema de escape",
    electrical: "componente eléctrico",
    drivetrain: "componente de transmisión",
    body: "componente de carrocería/interior",
    climate: "componente del sistema de climatización",
    fallback: "componente BMW",
    wrap: c => `componente de ${c}`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `${desc} BMW original (número de pieza ${partNum}) es un ${noun} OEM.`,
    chassisClause: ({ chassisList, multiple }) =>
      `Utilizado en los chasis ${chassisList}${multiple ? " (varias plataformas)" : ""}.`,
    fitmentClause: ({ models }) => `La compatibilidad confirmada incluye ${models}`,
    yearsClause: ({ years }) => `, años-modelo ${years}.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `Esta pieza ha sido sustituida por ${supersededBy}; al pedir ${partNum} normalmente se envía la revisión más reciente.`,
  },
  fitment: {
    none: "Aún no hay datos de compatibilidad verificados para esta pieza.",
    alsoReferenced: ch => `también referenciado para el chasis ${ch}`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}: ${topModels}`;
      if (extraCount > 0) s += ` y ${extraCount} más`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: "; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "Número de pieza OEM",
    searchNumber: "Número de búsqueda",
    weight: kg => ({ label: "Peso", value: `${kg} kg` }),
    quantity: "Cantidad habitual por vehículo",
    position: "Posición",
    catalogCategory: "Categoría del catálogo",
    catalogPath: "Ruta del catálogo",
    supersededBy: "Sustituido por",
    replaces: "Reemplaza a",
    notes: "Notas",
  },
  faq: {
    whichModels: {
      q: pn => `¿Qué modelos BMW utilizan la pieza ${pn}?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `La pieza ${partNum} encaja en ${models}${extra > 0 ? `, además de ${extra} variante${extra > 1 ? "s" : ""} más` : ""}, abarcando ${multiChassis ? "los chasis" : "el chasis"} ${chassisText}.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `La pieza ${partNum} aparece en los catálogos BMW para el chasis ${chassisText}.`,
      andMore: n => `(y ${n} más)`,
    },
    superseded: {
      q: pn => `¿Ha sido sustituida la pieza BMW ${pn}?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `Sí — BMW sustituye ${partNum} por ${supersededBy}. Pedir el número original normalmente envía la revisión actual de forma automática.`,
      aActive: pn =>
        `BMW lista actualmente ${pn} como número OEM activo. Si BMW emite una sustitución, ${pn} será reemplazado por la revisión más reciente al pedirlo a través de un concesionario.`,
    },
    weight: {
      q: pn => `¿Cuánto pesa la pieza ${pn}?`,
      a: ({ partNum, desc, kg }) =>
        `Los datos del catálogo BMW indican un peso de envío de aproximadamente ${kg} kg para ${desc} (${partNum}).`,
    },
    location: {
      q: ({ desc, partNum }) => `¿Dónde se encuentra ${desc} (${partNum}) en el coche?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} está catalogado bajo «${category} › ${subcategory}» en los diagramas de piezas BMW. Consulta el despiece para conocer la ubicación exacta y los componentes adyacentes.`,
    },
    oemEquivalent: {
      q: pn => `¿Cuál es el equivalente OEM de ${pn}?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} es en sí mismo el número de pieza original (OEM) de BMW. Existen equivalentes aftermarket de proveedores como Mahle, Bosch, Pierburg o Hella; usa ${partNumberClean} como referencia cruzada al buscar marcas no OEM.`,
    },
    quantity: {
      q: pn => `¿Cuántas unidades de la pieza ${pn} se montan por coche?`,
      a: ({ quantity }) =>
        `El catálogo BMW indica una cantidad típica de ${quantity} por vehículo para esta pieza en los ajustes listados.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — Para ${chassisCodes}`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `${desc} BMW OEM original (${partNum})`;
      if (chassisCodes) s += ` para ${chassisCodes}`;
      s += `. ${fitCount > 0 ? `Confirmada en ${fitCount} variante${fitCount !== 1 ? "s" : ""} BMW` : "Pieza OEM BMW"}, con diagramas, datos de sustitución y precios.`;
      return s;
    },
    titleMaxChars: 70,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `El chasis BMW ${label} agrupa ${carCount} variante${carCount === 1 ? "" : "s"} de fábrica`;
      if (series) s += ` dentro de la familia ${series}`;
      if (years) s += ` (${years})`;
      s += `, con ${totalPartsFmt} piezas OEM catalogadas en despieces.`;
      if (topCategoryNames.length > 0) {
        s += ` El catálogo es especialmente amplio en ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `Piezas BMW ${label} — Catálogo OEM`;
      if (years) t += ` (${years})`;
      if (t.length > 70) t = t.slice(0, 67) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `Consulta ${totalPartsFmt} piezas OEM para el chasis BMW ${label} en ${carCount} variante${carCount === 1 ? "" : "s"}. Números de pieza BMW originales, despieces, datos de sustitución y referencias cruzadas.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `¿Qué modelos BMW comparten el chasis ${label}?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `El chasis BMW ${label} cubre ${carCount} variante${carCount === 1 ? "" : "s"} de fábrica${series ? ` dentro de la familia ${series}` : ""}${years ? `, fabricadas ${years}` : ""}. Consulta la lista de modelos abajo para ver motor, carrocería y años de producción de cada variante.`,
      partsCountQ: label => `¿Cuántas piezas BMW ${label} están catalogadas?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts indexa ${totalPartsFmt} números de pieza OEM para el chasis ${label}, obtenidos del catálogo oficial BMW ETK y cruzados con PartsLink24.`,
      topCategoriesQ: label => `¿Qué categorías de ${label} tienen mayor cobertura?`,
      topCategoriesA: ({ label, topList }) =>
        `Las categorías más grandes del chasis ${label} por cantidad de piezas indexadas son: ${topList}.`,
      relatedQ: label => `¿Qué otros chasis BMW están relacionados con el ${label}?`,
      relatedA: ({ siblings }) =>
        `Chasis BMW estrechamente relacionados que también puedes consultar: ${siblings}.`,
      findRightPartQ: label => `¿Cómo encuentro la pieza BMW ${label} adecuada para mi coche?`,
      findRightPartA: () =>
        `Selecciona tu modelo exacto abajo para entrar en su catálogo, o usa el decodificador de VIN para asociar piezas a tu vehículo concreto. Cada ficha de pieza muestra compatibilidad, datos de sustitución y referencias cruzadas a proveedores equivalentes OEM.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `Catálogo de piezas ${displayName} — Piezas OEM y despieces`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt} ` : ""}piezas OEM para el BMW ${displayName} (${chassis}). Despieces, números de pieza y referencias cruzadas para ${modelName}${engine ? ` ${engine}` : ""}.`.trim(),
  },
  formatYearRange: defaultYearRange,
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `El catálogo de piezas BMW ${label} abarca ${carCount} variante${carCount === 1 ? "" : "s"} de fábrica`;
        if (chassisCodes.length > 0) {
          s += ` en ${chassisCodes.length} generación${chassisCodes.length === 1 ? "" : "es"} de bastidor (${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `, con ${totalPartsFmt} números de pieza BMW originales consultables por VIN, despiece o referencia.`;
        if (topCategoryNames.length > 0) {
          s += ` Secciones más consultadas: ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `Catálogo de piezas BMW ${label} — Todas las generaciones`;
        if (years) t += ` (${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `Explora el catálogo BMW ${label} completo — ${totalPartsFmt} piezas OEM en ${carCount} variante${carCount === 1 ? "" : "s"}`;
        if (chassisCodes.length > 0) {
          s += ` y ${chassisCodes.length} generación${chassisCodes.length === 1 ? "" : "es"} de bastidor`;
        }
        s += `. Números de pieza BMW originales, despieces, datos de reemplazo y referencias cruzadas.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `¿Qué generaciones de bastidor pertenecen al BMW ${label}?`,
        chassisInSeriesA: ({ label, count, list }) => `El BMW ${label} abarca ${count} generación${count === 1 ? "" : "es"} de bastidor: ${list}.`,
        partsCountQ: label => `¿Cuántas piezas BMW ${label} hay catalogadas en BMV.parts?`,
        partsCountA: ({ label, totalPartsFmt }) => `${totalPartsFmt} números de pieza OEM únicos están catalogados para la gama BMW ${label}, con despieces, datos de compatibilidad, peso y seguimiento de reemplazos.`,
        topCategoriesQ: label => `¿Qué categorías de ${label} tienen más piezas?`,
        topCategoriesA: ({ topList }) => `Por número de piezas indexadas, las mayores categorías BMW son: ${topList}.`,
        findRightPartQ: label => `¿Cómo encuentro la pieza BMW ${label} adecuada para mi coche?`,
        findRightPartA: () => `Elige tu modelo exacto abajo para explorar su catálogo, o utiliza el decodificador VIN. Cada ficha de pieza incluye compatibilidades, datos de reemplazo y referencias cruzadas a proveedores equivalentes OEM.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `Base de datos completa de variantes BMW — ${totalModelsFmt} modelos en todos los códigos de bastidor, con motor, carrocería y años de producción de cada entrada.`,
      metaTitle: () => `Base de datos de modelos BMW — Todos los códigos de bastidor y generaciones`,
      metaDescription: ({ totalModelsFmt }) => `Base de datos completa de referencia de modelos BMW — ${totalModelsFmt} variantes en cada código de bastidor, motor y generación. Especificaciones técnicas de todos los modelos BMW, del clásico al actual.`,
    },
    modelsHubUi: {
      pageTitle: "Referencia de modelos BMW",
      databaseLabel: "Base de datos de modelos",
      status: { ready: "Listo", syncing: "Sincronizando...", complete: "Completado", error: "Error" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `Descubriendo bastidores ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} modelos`,
      errorsCount: n => `${n} errores`,
      buttons: {
        cancel: "Cancelar",
        refresh: "Actualizar",
        syncModels: "Sincronizar modelos",
        importing: "Importando...",
        importLegacy: "Importar antiguos",
      },
      importLegacyTooltip: "Importar bastidores antiguos seleccionados (E36/E39/E46/E60/E83/E87/E90/F15) que bimmer.work no aloja",
      searchPlaceholder: "Buscar modelos, códigos de bastidor, motores...",
      resultsBadge: n => `${n} resultados`,
      filterAll: "Todos",
      showLess: "Menos",
      showMore: n => `+${n} más`,
      failedToLoad: "No se pudieron cargar los modelos.",
      emptyTitle: "No hay modelos en la base de datos",
      emptyHintWithSearch: "Ningún modelo coincide con tu búsqueda. Prueba con otra consulta.",
      emptyHintNoSearch: 'Haz clic en "Sincronizar modelos" arriba para importar las más de 1.350 variantes de modelos BMW.',
      variantsCount: n => `${n} variantes`,
    },
    hubLabels: {
      breadcrumbs: { home: "Inicio", series: "Serie", chassis: "Bastidor", models: "Modelos" },
      stats: {
        models: "Modelos",
        generations: "Generaciones",
        totalParts: "Piezas totales",
        bodyTypes: "Carrocerías",
        withPartsData: "Con datos de piezas",
        parts: "Piezas",
      },
      sections: {
        mostStockedCategories: (label) => `Categorías de ${label} con más stock`,
        chassisInThisSeries: "Bastidores de esta serie",
        relatedChassis: "Bastidores BMW relacionados",
        frequentlyAskedQuestions: "Preguntas frecuentes",
        allModelsHeading: ({ label, count }) => `Todos los modelos ${label} (${count})`,
        bodyTypesLabel: "Carrocerías:",
        enginesLabel: "Motores:",
        moreEngines: (n) => `+${n} más`,
        productionYears: (years) => `Años de producción: ${years}`,
        modelsCount: (n) => `${n} modelo${n === 1 ? "" : "s"}`,
        partsLowercase: "piezas",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount} modelo${carCount === 1 ? "" : "s"} · ${totalParts} piezas`,
        browse: "Explorar",
      },
      notFound: {
        seriesHeading: "Serie no encontrada",
        seriesMessage: (slug) => `No se ha podido encontrar la serie "${slug}".`,
        seriesMetaTitle: "Serie BMW no encontrada",
        backToHome: "Volver al inicio",
        chassisHeading: "Bastidor no encontrado",
        chassisMessage: (label) => `No se encontraron modelos BMW con el código de bastidor "${label}".`,
        chassisMetaTitle: (label) => `Piezas BMW ${label}`,
        chassisMetaDescription: (label) => `Explora el catálogo OEM de BMW ${label}.`,
        back: "Volver",
      },
    },
    vinLanding: {
      breadcrumbHome: "Inicio",
      breadcrumbVinDecoder: "Decodificador VIN",
      vehicleSummary: "Resumen del vehículo",
      vehiclePhotos: "Fotos del vehículo",
      ownersManuals: n => `Manuales del propietario (${n})`,
      factoryOptions: n => `Opciones de fábrica (${n})`,
      bmwOemPartsCatalog: "Catálogo de piezas OEM BMW",
      factVin: "VIN",
      factChassis: "Chasis",
      factModelYear: "Año del modelo",
      factEngine: "Motor",
      factDrivetrain: "Tracción",
      factTransmission: "Caja de cambios",
      factMarket: "Mercado",
      factPaint: "Pintura",
      factUpholstery: "Tapicería",
      factBuildDate: "Fecha de fabricación",
      factPlant: "Planta",
      exteriorCaption: "Exterior",
      interiorCaption: "Interior",
      exteriorAlt: ({ headline, vin }) => `Exterior de ${headline}, VIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `Interior de ${headline}, VIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `Vista exterior 360° de ${headline}, VIN ${vin}`,
      viewer360NoscriptCaption: n => `Vista exterior 360° (${n} fotogramas disponibles con JavaScript activado)`,
      viewer360HydrationHint: n => `El visor 360° (${n} fotogramas) se cargará tras la hidratación de JavaScript.`,
      manualHeaderManual: "Manual",
      manualHeaderNumber: "Número",
      manualHeaderLanguage: "Idioma",
      manualHeaderDate: "Fecha",
      catalogIntro: "Explora las piezas OEM para este BMW. Diagramas, números de pieza, compatibilidad y referencias cruzadas están organizados por grupo de sistema.",
      chassisLink: chassis => `Explorar piezas OEM para el chasis BMW ${chassis}`,
      seriesLink: series => `Descubrir la serie BMW ${series}`,
      decodeAnotherLink: "Decodificar otro VIN BMW",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "Catálogo propio";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "Manuales del propietario BMW";
          case "bimmerwork": return "bimmer.work (alternativa)";
          case "mdecoder": return "mdecoder (alternativa)";
          case "vindecoderz": return "vindecoderz (alternativa)";
          default: return null;
        }
      },
      preparingTitle: vin => `Preparando VIN ${vin}… | BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts está obteniendo el registro de fábrica BMW para el VIN ${vin}: datos del vehículo, fotos, opciones de fábrica y manuales del propietario. Actualiza en un momento para ver la página completa.`,
      preparingHeading: vin => `Preparando VIN ${vin}…`,
      preparingBody:
        "Estamos decodificando este VIN BMW con nuestras fuentes propias. Las fotos, opciones de fábrica y manuales aparecerán aquí en cuanto termine la consulta — normalmente en menos de un minuto.",
      preparingFooterLinkText: vin => `Abrir el decodificador VIN para ${vin}`,
      notFoundTitle: vin => `VIN ${vin} no encontrado | BMV.parts`,
      notFoundReasonInvalid: "Este VIN no es estructuralmente válido (longitud incorrecta o dígito de control no válido).",
      notFoundReasonNotBmw: "Este VIN no corresponde a un BMW (el prefijo WMI no coincide con ningún código de fabricante BMW).",
      notFoundReasonUncached: "Aún no tenemos un registro decodificado para este VIN.",
    },
  });
