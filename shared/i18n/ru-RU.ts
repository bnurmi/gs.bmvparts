// Russian (ru-RU) locale pack. Copy ships even if checkout is region-restricted
// per task spec; revisit before launch against current sanctions/payment rails.

import { makePack } from "./builder";
import { defaultYearRange } from "./types";

export const ruRUPack = makePack({
  meta: {
    code: "ru-RU",
    prefix: "ru",
    bcp47: "ru-RU",
    nativeLabel: "Русский",
    currency: "EUR",
    regionHint: "Доступность для России (CKD-сборка; цены ориентировочные в EUR)",
  },
  conjAnd: "и",
  conjOr: "или",
  nouns: {
    engine: "компонент двигателя",
    cooling: "компонент системы охлаждения",
    brake: "компонент тормозной системы",
    suspension: "компонент шасси/подвески",
    fuel: "компонент топливной системы",
    exhaust: "компонент выхлопной системы",
    electrical: "электрический компонент",
    drivetrain: "компонент трансмиссии",
    body: "компонент кузова/салона",
    climate: "компонент системы климат-контроля",
    fallback: "запчасть BMW",
    wrap: c => `компонент ${c}`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `Оригинальная запчасть BMW ${desc} (артикул ${partNum}) — ${noun} OEM.`,
    chassisClause: ({ chassisList, multiple }) =>
      `Применяется на кузовах ${chassisList}${multiple ? " (несколько платформ)" : ""}.`,
    fitmentClause: ({ models }) => `Подтверждённая совместимость включает ${models}`,
    yearsClause: ({ years }) => `, модельные годы ${years}.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `Эта запчасть заменена на ${supersededBy}; при заказе ${partNum} обычно поставляется актуальная ревизия.`,
  },
  fitment: {
    none: "Подтверждённые данные о совместимости для этой запчасти пока отсутствуют.",
    alsoReferenced: ch => `также упоминается для кузова ${ch}`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}: ${topModels}`;
      if (extraCount > 0) s += ` и ещё ${extraCount}`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: "; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "Артикул OEM",
    searchNumber: "Поисковый номер",
    weight: kg => ({ label: "Вес", value: `${kg} кг` }),
    quantity: "Типичное количество на автомобиль",
    position: "Положение",
    catalogCategory: "Категория каталога",
    catalogPath: "Путь в каталоге",
    supersededBy: "Заменена на",
    replaces: "Заменяет",
    notes: "Примечания",
  },
  faq: {
    whichModels: {
      q: pn => `Какие модели BMW используют запчасть ${pn}?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `Запчасть ${partNum} подходит для ${models}${extra > 0 ? `, а также ещё ${extra} вариант${extra > 1 ? "ов" : "а"}` : ""}, охватывая ${multiChassis ? "кузова" : "кузов"} ${chassisText}.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `Запчасть ${partNum} указана в каталогах BMW для кузова ${chassisText}.`,
      andMore: n => `(и ещё ${n})`,
    },
    superseded: {
      q: pn => `Заменена ли запчасть BMW ${pn}?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `Да — BMW заменяет ${partNum} на ${supersededBy}. Заказ оригинального номера обычно автоматически отправляет актуальную ревизию.`,
      aActive: pn =>
        `BMW в настоящее время указывает ${pn} как действующий артикул OEM. Если BMW введёт замену, ${pn} будет автоматически заменён на актуальную ревизию при заказе через дилера.`,
    },
    weight: {
      q: pn => `Сколько весит запчасть ${pn}?`,
      a: ({ partNum, desc, kg }) =>
        `Согласно данным каталога BMW, отгрузочный вес ${desc} (${partNum}) составляет около ${kg} кг.`,
    },
    location: {
      q: ({ desc, partNum }) => `Где находится ${desc} (${partNum}) на автомобиле?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} в каталоге BMW отнесена к разделу «${category} › ${subcategory}». Точное место установки и смежные компоненты см. на покомпонентной схеме.`,
    },
    oemEquivalent: {
      q: pn => `Что является OEM-аналогом ${pn}?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} — это собственно оригинальный (OEM) артикул BMW. В продаже широко представлены аналоги от поставщиков Mahle, Bosch, Pierburg или Hella; используйте ${partNumberClean} как кросс-номер при поиске неоригинальных брендов.`,
    },
    quantity: {
      q: pn => `Сколько штук запчасти ${pn} установлено на автомобиле?`,
      a: ({ quantity }) =>
        `Каталог BMW указывает типичное количество ${quantity} на автомобиль для этой запчасти по перечисленным применениям.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — Подходит ${chassisCodes}`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `Оригинальная запчасть BMW OEM ${desc} (${partNum})`;
      if (chassisCodes) s += ` для ${chassisCodes}`;
      s += `. ${fitCount > 0 ? `Подтверждена в ${fitCount} вариант${fitCount === 1 ? "е" : "ах"} BMW` : "Запчасть BMW OEM"}, со схемами, данными о замене и ценами.`;
      return s;
    },
    titleMaxChars: 70,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `Кузовная платформа BMW ${label} включает ${carCount} заводск${carCount === 1 ? "ую модификацию" : "их модификаций"}`;
      if (series) s += ` в семействе ${series}`;
      if (years) s += ` (${years})`;
      s += `, в каталоге — ${totalPartsFmt} OEM-запчастей с покомпонентными схемами.`;
      if (topCategoryNames.length > 0) {
        s += ` Особенно полно представлены категории: ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `Запчасти BMW ${label} — OEM-каталог`;
      if (years) t += ` (${years})`;
      if (t.length > 70) t = t.slice(0, 67) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `${totalPartsFmt} OEM-запчастей для кузова BMW ${label} по ${carCount} модельн${carCount === 1 ? "ой модификации" : "ым модификациям"}. Оригинальные номера BMW, схемы, данные о замене и перекрёстные ссылки.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `Какие модели BMW используют кузов ${label}?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `Кузов BMW ${label} включает ${carCount} заводск${carCount === 1 ? "ую модификацию" : "их модификаций"}${series ? ` в семействе ${series}` : ""}${years ? `, выпуск ${years}` : ""}. Список моделей ниже показывает двигатель, тип кузова и годы выпуска каждой модификации.`,
      partsCountQ: label => `Сколько запчастей BMW ${label} в каталоге?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts индексирует ${totalPartsFmt} OEM-номеров для кузова ${label} на основе официального каталога BMW ETK с перекрёстной проверкой по PartsLink24.`,
      topCategoriesQ: label => `Какие категории ${label} представлены наиболее полно?`,
      topCategoriesA: ({ label, topList }) =>
        `Крупнейшие категории по количеству индексированных запчастей для кузова ${label}: ${topList}.`,
      relatedQ: label => `Какие ещё кузова BMW связаны с ${label}?`,
      relatedA: ({ siblings }) =>
        `Близкие кузова BMW, которые также стоит просмотреть: ${siblings}.`,
      findRightPartQ: label => `Как подобрать нужную запчасть BMW ${label} для моей машины?`,
      findRightPartA: () =>
        `Выберите конкретную модель ниже, чтобы открыть её каталог, или используйте VIN-декодер для подбора запчастей под ваш автомобиль. На каждой странице запчасти указаны совместимость, данные о замене и перекрёстные ссылки на эквивалентных OEM-поставщиков.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `Каталог запчастей ${displayName} — OEM-запчасти и схемы`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt} ` : ""}OEM-запчастей для BMW ${displayName} (${chassis}). Покомпонентные схемы, номера деталей и перекрёстные ссылки для ${modelName}${engine ? ` ${engine}` : ""}.`.trim(),
  },
  formatYearRange: defaultYearRange,
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `Каталог запчастей BMW ${label} охватывает ${carCount} заводски${carCount === 1 ? "й вариант" : "х вариантов"}`;
        if (chassisCodes.length > 0) {
          s += ` в ${chassisCodes.length} поколени${chassisCodes.length === 1 ? "и" : "ях"} кузова (${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `, всего ${totalPartsFmt} оригинальных номеров BMW — поиск по VIN, схеме или номеру детали.`;
        if (topCategoryNames.length > 0) {
          s += ` Самые популярные разделы: ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `Каталог запчастей BMW ${label} — Все поколения`;
        if (years) t += ` (${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `Полный каталог BMW ${label} — ${totalPartsFmt} OEM-запчастей по ${carCount} вариант${carCount === 1 ? "у" : "ам"}`;
        if (chassisCodes.length > 0) {
          s += ` и ${chassisCodes.length} поколени${chassisCodes.length === 1 ? "ю" : "ям"} кузова`;
        }
        s += `. Оригинальные номера BMW, схемы, данные о замене и перекрёстные ссылки.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `Какие поколения кузова входят в BMW ${label}?`,
        chassisInSeriesA: ({ label, count, list }) => `BMW ${label} охватывает ${count} поколени${count === 1 ? "е" : "й"} кузова: ${list}.`,
        partsCountQ: label => `Сколько запчастей BMW ${label} есть в каталоге BMV.parts?`,
        partsCountA: ({ label, totalPartsFmt }) => `Для линейки BMW ${label} в каталог занесено ${totalPartsFmt} уникальных OEM-номеров с покомпонентными схемами, данными о применении, весе и отслеживанием замен.`,
        topCategoriesQ: label => `В каких категориях ${label} больше всего запчастей?`,
        topCategoriesA: ({ topList }) => `По количеству проиндексированных запчастей крупнейшие категории BMW: ${topList}.`,
        findRightPartQ: label => `Как подобрать правильную запчасть BMW ${label} для моего автомобиля?`,
        findRightPartA: () => `Выберите вашу модель ниже, чтобы перейти в её каталог, или используйте VIN-декодер. На странице каждой запчасти указаны применимость, данные о замене и перекрёстные ссылки на эквивалентных OEM-поставщиков.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `Полная база модификаций BMW — ${totalModelsFmt} модели по всем кодам кузова, с двигателем, типом кузова и годами выпуска для каждой записи.`,
      metaTitle: () => `База моделей BMW — Все коды кузова и поколения`,
      metaDescription: ({ totalModelsFmt }) => `Полная справочная база моделей BMW — ${totalModelsFmt} модификаций по всем кодам кузова, двигателям и поколениям. Технические характеристики всех моделей BMW от классических до современных.`,
    },
    modelsHubUi: {
      pageTitle: "Справочник моделей BMW",
      databaseLabel: "База данных моделей",
      status: { ready: "Готово", syncing: "Синхронизация...", complete: "Завершено", error: "Ошибка" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `Поиск кузовов ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} моделей`,
      errorsCount: n => `Ошибок: ${n}`,
      buttons: {
        cancel: "Отмена",
        refresh: "Обновить",
        syncModels: "Синхронизировать модели",
        importing: "Импорт...",
        importLegacy: "Импорт классики",
      },
      importLegacyTooltip: "Импортировать отобранные старые кузова (E36/E39/E46/E60/E83/E87/E90/F15), которых нет на bimmer.work",
      searchPlaceholder: "Поиск моделей, кодов кузова, двигателей...",
      resultsBadge: n => `Результатов: ${n}`,
      filterAll: "Все",
      showLess: "Свернуть",
      showMore: n => `+${n} ещё`,
      failedToLoad: "Не удалось загрузить модели.",
      emptyTitle: "В базе данных нет моделей",
      emptyHintWithSearch: "Нет моделей, соответствующих запросу. Попробуйте другой запрос.",
      emptyHintNoSearch: 'Нажмите "Синхронизировать модели" выше, чтобы импортировать все 1350+ модификаций BMW.',
      variantsCount: n => `${n} модификаций`,
    },
    hubLabels: {
      breadcrumbs: { home: "Главная", series: "Серия", chassis: "Кузов", models: "Модели" },
      stats: {
        models: "Модели",
        generations: "Поколения",
        totalParts: "Всего деталей",
        bodyTypes: "Типы кузова",
        withPartsData: "С данными о деталях",
        parts: "Детали",
      },
      sections: {
        mostStockedCategories: (label) => `Категории ${label} с самым полным каталогом`,
        chassisInThisSeries: "Кузова этой серии",
        relatedChassis: "Связанные кузова BMW",
        frequentlyAskedQuestions: "Часто задаваемые вопросы",
        allModelsHeading: ({ label, count }) => `Все модели ${label} (${count})`,
        bodyTypesLabel: "Типы кузова:",
        enginesLabel: "Двигатели:",
        moreEngines: (n) => `+${n} ещё`,
        productionYears: (years) => `Годы выпуска: ${years}`,
        modelsCount: (n) => {
          const mod10 = n % 10;
          const mod100 = n % 100;
          if (mod10 === 1 && mod100 !== 11) return `${n} модель`;
          if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} модели`;
          return `${n} моделей`;
        },
        partsLowercase: "деталей",
        relatedChassisCaption: ({ carCount, totalParts }) => {
          const mod10 = carCount % 10;
          const mod100 = carCount % 100;
          let word = "моделей";
          if (mod10 === 1 && mod100 !== 11) word = "модель";
          else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "модели";
          return `${carCount} ${word} · ${totalParts} деталей`;
        },
        browse: "Открыть",
      },
      notFound: {
        seriesHeading: "Серия не найдена",
        seriesMessage: (slug) => `Серия «${slug}» не найдена.`,
        seriesMetaTitle: "Серия BMW не найдена",
        backToHome: "На главную",
        chassisHeading: "Кузов не найден",
        chassisMessage: (label) => `Модели BMW с кодом кузова «${label}» не найдены.`,
        chassisMetaTitle: (label) => `Детали BMW ${label}`,
        chassisMetaDescription: (label) => `Каталог OEM-деталей BMW ${label}.`,
        back: "Назад",
      },
    },
    vinLanding: {
      breadcrumbHome: "Главная",
      breadcrumbVinDecoder: "Декодер VIN",
      vehicleSummary: "Сводка по автомобилю",
      vehiclePhotos: "Фотографии автомобиля",
      ownersManuals: n => `Руководства по эксплуатации (${n})`,
      factoryOptions: n => `Заводские опции (${n})`,
      bmwOemPartsCatalog: "Каталог OEM-деталей BMW",
      factVin: "VIN",
      factChassis: "Кузов",
      factModelYear: "Модельный год",
      factEngine: "Двигатель",
      factDrivetrain: "Привод",
      factTransmission: "Коробка передач",
      factMarket: "Рынок",
      factPaint: "Цвет кузова",
      factUpholstery: "Обивка",
      factBuildDate: "Дата производства",
      factPlant: "Завод",
      exteriorCaption: "Экстерьер",
      interiorCaption: "Интерьер",
      exteriorAlt: ({ headline, vin }) => `Экстерьер ${headline}, VIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `Интерьер ${headline}, VIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `360° обзор экстерьера ${headline}, VIN ${vin}`,
      viewer360NoscriptCaption: n => `360° обзор экстерьера (${n} кадров доступно с включенным JavaScript)`,
      viewer360HydrationHint: n => `360° просмотрщик (${n} кадров) загрузится после гидратации JavaScript.`,
      manualHeaderManual: "Руководство",
      manualHeaderNumber: "Номер",
      manualHeaderLanguage: "Язык",
      manualHeaderDate: "Дата",
      catalogIntro: "Просматривайте OEM-детали для этого BMW. Схемы, номера деталей, применимость и перекрёстные ссылки сгруппированы по системам.",
      chassisLink: chassis => `Каталог OEM-деталей для шасси BMW ${chassis}`,
      seriesLink: series => `Серия BMW ${series}`,
      decodeAnotherLink: "Декодировать другой VIN BMW",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "Собственный каталог";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "Руководства BMW";
          case "bimmerwork": return "bimmer.work (резерв)";
          case "mdecoder": return "mdecoder (резерв)";
          case "vindecoderz": return "vindecoderz (резерв)";
          default: return null;
        }
      },
      preparingTitle: vin => `Подготовка VIN ${vin}… | BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts получает заводские данные BMW для VIN ${vin}: данные автомобиля, фотографии, заводские опции и руководства по эксплуатации. Обновите страницу через мгновение, чтобы увидеть полную версию.`,
      preparingHeading: vin => `Подготовка VIN ${vin}…`,
      preparingBody:
        "Мы декодируем этот VIN BMW по нашим собственным источникам. Фотографии, заводские опции и руководства появятся здесь, как только запрос будет завершён — обычно менее чем за минуту.",
      preparingFooterLinkText: vin => `Открыть декодер VIN для ${vin}`,
      notFoundTitle: vin => `VIN ${vin} не найден | BMV.parts`,
      notFoundReasonInvalid: "Этот VIN структурно недействителен (неверная длина или неверная контрольная цифра).",
      notFoundReasonNotBmw: "Этот VIN не принадлежит BMW (префикс WMI не соответствует ни одному коду производителя BMW).",
      notFoundReasonUncached: "У нас пока нет декодированной записи для этого VIN.",
    },
  });
