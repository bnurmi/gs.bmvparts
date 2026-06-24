// Brazilian Portuguese (pt-BR) locale pack.

import { makePack } from "./builder";
import { defaultYearRange } from "./types";

export const ptBRPack = makePack({
  meta: {
    code: "pt-BR",
    prefix: "pt-br",
    bcp47: "pt-BR",
    nativeLabel: "Português (Brasil)",
    currency: "EUR",
    regionHint: "Disponibilidade no Brasil (montagem CKD; preços indicativos em EUR)",
  },
  conjAnd: "e",
  conjOr: "ou",
  nouns: {
    engine: "componente do motor",
    cooling: "componente do sistema de arrefecimento",
    brake: "componente do sistema de freios",
    suspension: "componente de chassi/suspensão",
    fuel: "componente do sistema de combustível",
    exhaust: "componente do sistema de escapamento",
    electrical: "componente elétrico",
    drivetrain: "componente do trem de força",
    body: "componente de carroceria/acabamento interno",
    climate: "componente do sistema de climatização",
    fallback: "peça BMW",
    wrap: c => `componente de ${c}`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `Peça BMW genuína ${desc} (número de peça ${partNum}) é um ${noun} OEM.`,
    chassisClause: ({ chassisList, multiple }) =>
      `Utilizado nos chassis ${chassisList}${multiple ? " (várias plataformas)" : ""}.`,
    fitmentClause: ({ models }) => `A compatibilidade confirmada inclui ${models}`,
    yearsClause: ({ years }) => `, anos-modelo ${years}.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `Esta peça foi substituída por ${supersededBy}; ao pedir ${partNum} normalmente é enviada a revisão mais recente.`,
  },
  fitment: {
    none: "Ainda não há dados de compatibilidade verificados para esta peça.",
    alsoReferenced: ch => `também referenciado para o chassi ${ch}`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}: ${topModels}`;
      if (extraCount > 0) s += ` e mais ${extraCount}`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: "; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "Número de peça OEM",
    searchNumber: "Número de busca",
    weight: kg => ({ label: "Peso", value: `${kg} kg` }),
    quantity: "Quantidade típica por veículo",
    position: "Posição",
    catalogCategory: "Categoria do catálogo",
    catalogPath: "Caminho do catálogo",
    supersededBy: "Substituído por",
    replaces: "Substitui",
    notes: "Observações",
  },
  faq: {
    whichModels: {
      q: pn => `Quais modelos BMW usam a peça ${pn}?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `A peça ${partNum} se ajusta a ${models}${extra > 0 ? `, além de mais ${extra} variante${extra > 1 ? "s" : ""}` : ""}, abrangendo ${multiChassis ? "os chassis" : "o chassi"} ${chassisText}.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `A peça ${partNum} aparece nos catálogos BMW para o chassi ${chassisText}.`,
      andMore: n => `(e mais ${n})`,
    },
    superseded: {
      q: pn => `A peça BMW ${pn} foi substituída?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `Sim — a BMW substitui ${partNum} por ${supersededBy}. Pedir o número original normalmente envia a revisão atual automaticamente.`,
      aActive: pn =>
        `A BMW lista atualmente ${pn} como número OEM ativo. Se a BMW emitir uma substituição, ${pn} será trocado pela revisão mais recente automaticamente quando pedido em uma concessionária.`,
    },
    weight: {
      q: pn => `Quanto pesa a peça ${pn}?`,
      a: ({ partNum, desc, kg }) =>
        `Os dados do catálogo BMW indicam um peso de envio de aproximadamente ${kg} kg para ${desc} (${partNum}).`,
    },
    location: {
      q: ({ desc, partNum }) => `Onde fica ${desc} (${partNum}) no veículo?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} está catalogado em "${category} › ${subcategory}" nos diagramas BMW. Consulte a vista explodida para a posição exata de montagem e os componentes adjacentes.`,
    },
    oemEquivalent: {
      q: pn => `Qual é o equivalente OEM de ${pn}?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} é o próprio número de peça original (OEM) BMW. Equivalentes aftermarket de fornecedores como Mahle, Bosch, Pierburg ou Hella são comuns; use ${partNumberClean} como referência cruzada ao buscar marcas não OEM.`,
    },
    quantity: {
      q: pn => `Quantas unidades da peça ${pn} são montadas por veículo?`,
      a: ({ quantity }) =>
        `O catálogo BMW indica uma quantidade típica de ${quantity} por veículo para esta peça nas compatibilidades listadas.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — Compatível ${chassisCodes}`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `Peça BMW OEM genuína ${desc} (${partNum})`;
      if (chassisCodes) s += ` para ${chassisCodes}`;
      s += `. ${fitCount > 0 ? `Confirmada em ${fitCount} variante${fitCount !== 1 ? "s" : ""} BMW` : "Peça OEM BMW"}, com diagramas, dados de substituição e preços.`;
      return s;
    },
    titleMaxChars: 70,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `O chassi BMW ${label} cobre ${carCount} variante${carCount === 1 ? "" : "s"} de fábrica`;
      if (series) s += ` na família ${series}`;
      if (years) s += ` (${years})`;
      s += `, com ${totalPartsFmt} peças OEM catalogadas em vistas explodidas.`;
      if (topCategoryNames.length > 0) {
        s += ` O catálogo é especialmente forte em ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `Peças BMW ${label} — Catálogo OEM`;
      if (years) t += ` (${years})`;
      if (t.length > 70) t = t.slice(0, 67) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `Veja ${totalPartsFmt} peças OEM para o chassi BMW ${label} em ${carCount} variante${carCount === 1 ? "" : "s"}. Números de peças BMW genuínas, vistas explodidas, dados de substituição e referências cruzadas.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `Quais modelos BMW compartilham o chassi ${label}?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `O chassi BMW ${label} cobre ${carCount} variante${carCount === 1 ? "" : "s"} de fábrica${series ? ` na família ${series}` : ""}${years ? `, produzidas ${years}` : ""}. Veja a lista de modelos abaixo para motor, carroceria e anos de produção de cada variante.`,
      partsCountQ: label => `Quantas peças BMW ${label} estão catalogadas?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts indexa ${totalPartsFmt} números de peças OEM para o chassi ${label}, obtidos do catálogo oficial BMW ETK e cruzados com o PartsLink24.`,
      topCategoriesQ: label => `Quais categorias de ${label} têm a maior cobertura?`,
      topCategoriesA: ({ label, topList }) =>
        `As maiores categorias do chassi ${label} pelo número de peças indexadas são: ${topList}.`,
      relatedQ: label => `Quais outros chassis BMW são relacionados ao ${label}?`,
      relatedA: ({ siblings }) =>
        `Chassis BMW próximos que você também pode consultar: ${siblings}.`,
      findRightPartQ: label => `Como encontro a peça BMW ${label} certa para o meu carro?`,
      findRightPartA: () =>
        `Selecione o modelo exato abaixo para abrir o catálogo correspondente, ou use o decodificador de VIN para casar peças com o seu veículo. Cada página de peça lista compatibilidade, substituições e referências cruzadas a fornecedores equivalentes OEM.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `Catálogo de peças ${displayName} — Peças OEM e vistas explodidas`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt} ` : ""}peças OEM para o BMW ${displayName} (${chassis}). Vistas explodidas, números de peças e referências cruzadas para ${modelName}${engine ? ` ${engine}` : ""}.`.trim(),
  },
  formatYearRange: defaultYearRange,
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `O catálogo de peças BMW ${label} abrange ${carCount} variante${carCount === 1 ? "" : "s"} de fábrica`;
        if (chassisCodes.length > 0) {
          s += ` em ${chassisCodes.length} geração${chassisCodes.length === 1 ? "" : "ões"} de chassi (${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `, com ${totalPartsFmt} números de peça BMW originais consultáveis por VIN, vista explodida ou número.`;
        if (topCategoryNames.length > 0) {
          s += ` Seções mais acessadas: ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `Catálogo de peças BMW ${label} — Todas as gerações`;
        if (years) t += ` (${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `Navegue pelo catálogo BMW ${label} completo — ${totalPartsFmt} peças OEM em ${carCount} variante${carCount === 1 ? "" : "s"}`;
        if (chassisCodes.length > 0) {
          s += ` e ${chassisCodes.length} geração${chassisCodes.length === 1 ? "" : "ões"} de chassi`;
        }
        s += `. Números de peça BMW originais, vistas explodidas, dados de substituição e referências cruzadas.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `Quais gerações de chassi pertencem ao BMW ${label}?`,
        chassisInSeriesA: ({ label, count, list }) => `O BMW ${label} abrange ${count} geração${count === 1 ? "" : "ões"} de chassi: ${list}.`,
        partsCountQ: label => `Quantas peças BMW ${label} estão catalogadas no BMV.parts?`,
        partsCountA: ({ label, totalPartsFmt }) => `${totalPartsFmt} números de peça OEM únicos estão catalogados para a linha BMW ${label}, com vistas explodidas, dados de aplicação, peso e rastreamento de substituições.`,
        topCategoriesQ: label => `Quais categorias do ${label} têm mais peças?`,
        topCategoriesA: ({ topList }) => `Por número de peças indexadas, as maiores categorias BMW são: ${topList}.`,
        findRightPartQ: label => `Como encontro a peça BMW ${label} certa para o meu carro?`,
        findRightPartA: () => `Escolha o modelo exato abaixo para entrar no catálogo, ou use o decodificador de VIN. Cada página de peça lista aplicações, dados de substituição e referências cruzadas para fornecedores equivalentes OEM.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `Banco de dados completo de variantes BMW — ${totalModelsFmt} modelos em todos os códigos de chassi, com motor, carroceria e anos de produção para cada entrada.`,
      metaTitle: () => `Banco de dados de modelos BMW — Todos os códigos de chassi e gerações`,
      metaDescription: ({ totalModelsFmt }) => `Banco de dados completo de referência de modelos BMW — ${totalModelsFmt} variantes em cada código de chassi, motor e geração. Especificações técnicas de todos os modelos BMW, dos clássicos aos atuais.`,
    },
    modelsHubUi: {
      pageTitle: "Referência de modelos BMW",
      databaseLabel: "Banco de dados de modelos",
      status: { ready: "Pronto", syncing: "Sincronizando...", complete: "Concluído", error: "Erro" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `Descobrindo chassis ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} modelos`,
      errorsCount: n => `${n} erros`,
      buttons: {
        cancel: "Cancelar",
        refresh: "Atualizar",
        syncModels: "Sincronizar modelos",
        importing: "Importando...",
        importLegacy: "Importar legados",
      },
      importLegacyTooltip: "Importa chassis legados selecionados (E36/E39/E46/E60/E83/E87/E90/F15) que o bimmer.work não hospeda",
      searchPlaceholder: "Buscar modelos, códigos de chassis, motores...",
      resultsBadge: n => `${n} resultados`,
      filterAll: "Todos",
      showLess: "Menos",
      showMore: n => `+${n} mais`,
      failedToLoad: "Falha ao carregar os modelos.",
      emptyTitle: "Nenhum modelo no banco de dados",
      emptyHintWithSearch: "Nenhum modelo corresponde à sua busca. Tente outra consulta.",
      emptyHintNoSearch: 'Clique em "Sincronizar modelos" acima para importar todas as mais de 1.350 variantes de modelos BMW.',
      variantsCount: n => `${n} variantes`,
    },
    hubLabels: {
      breadcrumbs: { home: "Início", series: "Série", chassis: "Chassi", models: "Modelos" },
      stats: {
        models: "Modelos",
        generations: "Gerações",
        totalParts: "Peças totais",
        bodyTypes: "Carrocerias",
        withPartsData: "Com dados de peças",
        parts: "Peças",
      },
      sections: {
        mostStockedCategories: (label) => `Categorias ${label} com mais peças`,
        chassisInThisSeries: "Chassis desta série",
        relatedChassis: "Chassis BMW relacionados",
        frequentlyAskedQuestions: "Perguntas frequentes",
        allModelsHeading: ({ label, count }) => `Todos os modelos ${label} (${count})`,
        bodyTypesLabel: "Carrocerias:",
        enginesLabel: "Motores:",
        moreEngines: (n) => `+${n} a mais`,
        productionYears: (years) => `Anos de produção: ${years}`,
        modelsCount: (n) => `${n} modelo${n === 1 ? "" : "s"}`,
        partsLowercase: "peças",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount} modelo${carCount === 1 ? "" : "s"} · ${totalParts} peças`,
        browse: "Explorar",
      },
      notFound: {
        seriesHeading: "Série não encontrada",
        seriesMessage: (slug) => `Não foi possível encontrar a série "${slug}".`,
        seriesMetaTitle: "Série BMW não encontrada",
        backToHome: "Voltar ao início",
        chassisHeading: "Chassi não encontrado",
        chassisMessage: (label) => `Nenhum modelo BMW encontrado com código de chassi "${label}".`,
        chassisMetaTitle: (label) => `Peças BMW ${label}`,
        chassisMetaDescription: (label) => `Explore o catálogo OEM da BMW ${label}.`,
        back: "Voltar",
      },
    },
    vinLanding: {
      breadcrumbHome: "Início",
      breadcrumbVinDecoder: "Decodificador VIN",
      vehicleSummary: "Resumo do veículo",
      vehiclePhotos: "Fotos do veículo",
      ownersManuals: n => `Manuais do proprietário (${n})`,
      factoryOptions: n => `Opcionais de fábrica (${n})`,
      bmwOemPartsCatalog: "Catálogo de peças OEM BMW",
      factVin: "VIN",
      factChassis: "Chassi",
      factModelYear: "Ano-modelo",
      factEngine: "Motor",
      factDrivetrain: "Tração",
      factTransmission: "Transmissão",
      factMarket: "Mercado",
      factPaint: "Pintura",
      factUpholstery: "Estofamento",
      factBuildDate: "Data de fabricação",
      factPlant: "Planta",
      exteriorCaption: "Exterior",
      interiorCaption: "Interior",
      exteriorAlt: ({ headline, vin }) => `Exterior do ${headline}, VIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `Interior do ${headline}, VIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `Vista exterior 360° do ${headline}, VIN ${vin}`,
      viewer360NoscriptCaption: n => `Vista exterior 360° (${n} quadros disponíveis com JavaScript ativado)`,
      viewer360HydrationHint: n => `O visualizador 360° (${n} quadros) será carregado após a hidratação do JavaScript.`,
      manualHeaderManual: "Manual",
      manualHeaderNumber: "Número",
      manualHeaderLanguage: "Idioma",
      manualHeaderDate: "Data",
      catalogIntro: "Explore as peças OEM para esta BMW. Diagramas, números de peça, compatibilidade e referências cruzadas estão organizados por grupo de sistema.",
      chassisLink: chassis => `Explorar peças OEM para o chassi BMW ${chassis}`,
      seriesLink: series => `Conhecer a série BMW ${series}`,
      decodeAnotherLink: "Decodificar outro VIN BMW",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "Catálogo próprio";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "Manuais do proprietário BMW";
          case "bimmerwork": return "bimmer.work (alternativa)";
          case "mdecoder": return "mdecoder (alternativa)";
          case "vindecoderz": return "vindecoderz (alternativa)";
          default: return null;
        }
      },
      preparingTitle: vin => `Preparando VIN ${vin}… | BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts está obtendo o registro de fábrica BMW para o VIN ${vin}: dados do veículo, fotos, opcionais de fábrica e manuais do proprietário. Atualize em instantes para ver a página completa.`,
      preparingHeading: vin => `Preparando VIN ${vin}…`,
      preparingBody:
        "Estamos decodificando este VIN BMW com nossas fontes próprias. Fotos, opcionais de fábrica e manuais aparecerão aqui assim que a consulta for concluída — geralmente em menos de um minuto.",
      preparingFooterLinkText: vin => `Abrir o decodificador VIN para ${vin}`,
      notFoundTitle: vin => `VIN ${vin} não encontrado | BMV.parts`,
      notFoundReasonInvalid: "Este VIN não é estruturalmente válido (comprimento incorreto ou dígito verificador inválido).",
      notFoundReasonNotBmw: "Este VIN não corresponde a uma BMW (o prefixo WMI não corresponde a nenhum código de fabricante BMW).",
      notFoundReasonUncached: "Ainda não temos um registro decodificado para este VIN.",
    },
  });
