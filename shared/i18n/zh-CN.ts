// Simplified Chinese (zh-CN) locale pack.
// CJK note: meta-description char limit is left at 160 (Google measures
// ~160 chars even for CJK in many SERPs); titles trim at 60. We do not
// hyphenate part numbers — display strings keep them whole.

import { makePack } from "./builder";

function yearRange(start: number | null, end: number | null): string {
  if (!start) return "";
  if (!end) return `${start}年至今`;
  if (start === end) return `${start}年`;
  return `${start}–${end}年`;
}

export const zhCNPack = makePack({
  meta: {
    code: "zh-CN",
    prefix: "zh",
    bcp47: "zh-CN",
    nativeLabel: "简体中文",
    currency: "EUR",
    regionHint: "中国市场参考价格(以欧元报价)",
    isCJK: true,
  },
  conjAnd: "、",
  conjOr: "或",
  formatYearRange: yearRange,
  nouns: {
    engine: "发动机系统部件",
    cooling: "冷却系统部件",
    brake: "制动系统部件",
    suspension: "底盘/悬挂部件",
    fuel: "燃油系统部件",
    exhaust: "排气系统部件",
    electrical: "电气部件",
    drivetrain: "传动系统部件",
    body: "车身/内饰部件",
    climate: "空调系统部件",
    fallback: "BMW 部件",
    wrap: c => `${c}部件`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `BMW 原厂 ${desc}(零件号 ${partNum})是一款 OEM ${noun}。`,
    chassisClause: ({ chassisList, multiple }) =>
      `适用于 ${chassisList} 等${multiple ? "多个" : ""}底盘平台。`,
    fitmentClause: ({ models }) => `已确认适配车型包括 ${models}`,
    yearsClause: ({ years }) => `,覆盖 ${years} 车型年。`,
    supersededClause: ({ partNum, supersededBy }) =>
      `该零件已被 ${supersededBy} 替代;订购 ${partNum} 时通常会发出最新版本。`,
  },
  fitment: {
    none: "暂无该零件的已验证适配数据。",
    alsoReferenced: ch => `${ch} 底盘亦有引用`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}:${topModels}`;
      if (extraCount > 0) s += ` 等 ${extraCount} 款车型`;
      if (years) s += `(${years})`;
      return s;
    },
    join: ";",
    terminator: "。",
  },
  specs: {
    oemPartNumber: "OEM 零件号",
    searchNumber: "查询号",
    weight: kg => ({ label: "重量", value: `${kg} 千克` }),
    quantity: "每车典型数量",
    position: "安装位置",
    catalogCategory: "目录分类",
    catalogPath: "目录路径",
    supersededBy: "替代为",
    replaces: "替代",
    notes: "备注",
  },
  faq: {
    whichModels: {
      q: pn => `哪些 BMW 车型使用零件 ${pn}?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `零件 ${partNum} 适配 ${models}${extra > 0 ? `,以及另外 ${extra} 款变体` : ""},覆盖 ${chassisText} ${multiChassis ? "等底盘平台" : "底盘"}。`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `零件 ${partNum} 出现在 ${chassisText} 底盘的 BMW 目录中。`,
      andMore: n => `(及另外 ${n} 款)`,
    },
    superseded: {
      q: pn => `BMW 零件 ${pn} 是否已被替代?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `是的 — BMW 已用 ${supersededBy} 替代 ${partNum}。订购原编号时通常会自动发出当前版本。`,
      aActive: pn =>
        `BMW 目前将 ${pn} 列为有效的 OEM 编号。如果 BMW 发布替代,经销商订购时 ${pn} 将自动替换为最新版本。`,
    },
    weight: {
      q: pn => `零件 ${pn} 的重量是多少?`,
      a: ({ partNum, desc, kg }) =>
        `BMW 目录数据显示 ${desc}(${partNum})的发货重量约为 ${kg} 千克。`,
    },
    location: {
      q: ({ desc, partNum }) => `${desc}(${partNum})位于车上的哪个位置?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} 在 BMW 零件图中归类于「${category} › ${subcategory}」。请参考爆炸图查看准确安装位置及相邻部件。`,
    },
    oemEquivalent: {
      q: pn => `${pn} 的 OEM 对应件是什么?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} 本身就是 BMW 原厂(OEM)零件号。Mahle、Bosch、Pierburg 或 Hella 等供应商提供常见的副厂替代件;选购非原厂品牌时请使用 ${partNumberClean} 进行交叉查询。`,
    },
    quantity: {
      q: pn => `每辆车安装多少件 ${pn}?`,
      a: ({ quantity }) =>
        `在已列出的适配中,BMW 目录显示该零件的典型每车数量为 ${quantity}。`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — 适用 ${chassisCodes}`;
      if (years) t += `(${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `BMW 原厂 OEM ${desc}(${partNum})`;
      if (chassisCodes) s += `,适用于 ${chassisCodes}`;
      s += `。${fitCount > 0 ? `已在 ${fitCount} 款 BMW 车型变体中确认` : "BMW OEM 零件"},含图纸、替代信息与价格。`;
      return s;
    },
    titleMaxChars: 60,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `BMW ${label} 底盘平台涵盖 ${carCount} 款工厂车型`;
      if (series) s += `,属于 ${series} 系列`;
      if (years) s += `(${years})`;
      s += `,共收录 ${totalPartsFmt} 个 OEM 零件,提供爆炸图。`;
      if (topCategoryNames.length > 0) {
        s += ` 目录在 ${topCategoryNames.slice(0, 4).join("、")} 等类别尤为完整。`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `BMW ${label} 零件 — OEM 目录`;
      if (years) t += `(${years})`;
      if (t.length > 60) t = t.slice(0, 57) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `浏览 BMW ${label} 底盘的 ${totalPartsFmt} 个 OEM 零件,覆盖 ${carCount} 款车型变体。BMW 原厂零件号、爆炸图、替代信息及交叉对照。`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `哪些 BMW 车型共享 ${label} 底盘?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `BMW ${label} 底盘涵盖 ${carCount} 款工厂车型${series ? `,属于 ${series} 系列` : ""}${years ? `,生产年份 ${years}` : ""}。请查看下方车型列表,了解每款变体的发动机、车身类型和生产年份。`,
      partsCountQ: label => `BMW ${label} 共收录多少零件?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts 为 ${label} 底盘索引了 ${totalPartsFmt} 个 OEM 零件号,源自 BMW 官方 ETK 目录,并与 PartsLink24 进行交叉对照。`,
      topCategoriesQ: label => `${label} 哪些零件类别覆盖最深?`,
      topCategoriesA: ({ label, topList }) =>
        `${label} 底盘按已索引零件数排名最大的类别为:${topList}。`,
      relatedQ: label => `还有哪些 BMW 底盘与 ${label} 相关?`,
      relatedA: ({ siblings }) =>
        `推荐一并浏览的相关 BMW 底盘:${siblings}。`,
      findRightPartQ: label => `如何为我的车找到合适的 BMW ${label} 零件?`,
      findRightPartA: () =>
        `请在下方选择具体车型进入对应目录,或使用 VIN 解码工具按车架号匹配零件。每个零件页面都包含适配信息、替代信息以及对应 OEM 等效供应商的交叉参考。`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `${displayName} 零件目录 — OEM 零件与爆炸图`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt} 个` : ""}OEM 零件,适用于 BMW ${displayName}(${chassis})。${modelName}${engine ? ` ${engine}` : ""} 的爆炸图、零件号与交叉参考。`.trim(),
  },
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `BMW ${label} 零件目录涵盖 ${carCount} 个工厂车型`;
        if (chassisCodes.length > 0) {
          s += `,跨越 ${chassisCodes.length} 代底盘(${chassisCodes.slice(0, 8).join("、")}${chassisCodes.length > 8 ? `,等 +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `,${years}`;
        s += `,共 ${totalPartsFmt} 个 BMW 原厂零件号,可按 VIN、爆炸图或零件号检索。`;
        if (topCategoryNames.length > 0) {
          s += ` 最常浏览的分类:${topCategoryNames.slice(0, 4).join("、")}。`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `BMW ${label} 零件目录 — 全代车型`;
        if (years) t += `(${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `完整 BMW ${label} 零件目录 — 共 ${totalPartsFmt} 个 OEM 零件,涵盖 ${carCount} 个车型`;
        if (chassisCodes.length > 0) {
          s += `、${chassisCodes.length} 代底盘`;
        }
        s += `。原厂 BMW 零件号、爆炸图、替换数据与交叉参考。`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `BMW ${label} 包含哪些底盘代号?`,
        chassisInSeriesA: ({ label, count, list }) => `BMW ${label} 跨越 ${count} 代底盘:${list}。`,
        partsCountQ: label => `BMV.parts 收录了多少个 BMW ${label} 零件?`,
        partsCountA: ({ label, totalPartsFmt }) => `BMW ${label} 系列共收录 ${totalPartsFmt} 个唯一的 OEM 零件号,包含爆炸图、适配数据、重量及替换跟踪。`,
        topCategoriesQ: label => `哪些 ${label} 分类零件最多?`,
        topCategoriesA: ({ topList }) => `按已索引零件数,最大的 BMW 分类是:${topList}。`,
        findRightPartQ: label => `如何为我的车找到合适的 BMW ${label} 零件?`,
        findRightPartA: () => `请在下方选择您的具体车型进入对应目录,或使用 VIN 解码器。每个零件页面都列出适配信息、替换数据和到等效 OEM 供应商的交叉参考。`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `完整的 BMW 车型变体数据库 — 涵盖所有底盘代号的 ${totalModelsFmt} 款车型,每条记录均包含发动机、车身形式和生产年份。`,
      metaTitle: () => `BMW 车型数据库 — 全部底盘代号与车系`,
      metaDescription: ({ totalModelsFmt }) => `完整的 BMW 车型参考数据库 — 共 ${totalModelsFmt} 款车型变体,覆盖所有底盘代号、发动机和车系。提供从经典到最新所有 BMW 车型的技术规格。`,
    },
    modelsHubUi: {
      pageTitle: "BMW 车型参考",
      databaseLabel: "车型数据库",
      status: { ready: "就绪", syncing: "同步中...", complete: "已完成", error: "错误" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `正在发现底盘 ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} 款车型`,
      errorsCount: n => `${n} 个错误`,
      buttons: {
        cancel: "取消",
        refresh: "刷新",
        syncModels: "同步车型",
        importing: "导入中...",
        importLegacy: "导入经典",
      },
      importLegacyTooltip: "导入 bimmer.work 未收录的精选经典底盘（E36/E39/E46/E60/E83/E87/E90/F15）",
      searchPlaceholder: "搜索车型、底盘代号、发动机...",
      resultsBadge: n => `${n} 个结果`,
      filterAll: "全部",
      showLess: "收起",
      showMore: n => `还有 ${n} 个`,
      failedToLoad: "车型加载失败。",
      emptyTitle: "数据库中暂无车型",
      emptyHintWithSearch: "没有匹配的车型。请尝试其他关键词。",
      emptyHintNoSearch: '点击上方"同步车型"以导入全部 1,350+ 款 BMW 车型变体。',
      variantsCount: n => `${n} 个变体`,
    },
    hubLabels: {
      breadcrumbs: { home: "首页", series: "车系", chassis: "底盘", models: "车型" },
      stats: {
        models: "车型",
        generations: "代数",
        totalParts: "零件总数",
        bodyTypes: "车身类型",
        withPartsData: "含零件数据",
        parts: "零件",
      },
      sections: {
        mostStockedCategories: (label) => `${label} 库存最丰富的类别`,
        chassisInThisSeries: "本车系底盘",
        relatedChassis: "相关 BMW 底盘",
        frequentlyAskedQuestions: "常见问题",
        allModelsHeading: ({ label, count }) => `全部 ${label} 车型(${count})`,
        bodyTypesLabel: "车身类型:",
        enginesLabel: "发动机:",
        moreEngines: (n) => `另有 ${n} 款`,
        productionYears: (years) => `生产年份:${years}`,
        modelsCount: (n) => `${n} 款车型`,
        partsLowercase: "零件",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount} 款车型 · ${totalParts} 个零件`,
        browse: "浏览",
      },
      notFound: {
        seriesHeading: "未找到车系",
        seriesMessage: (slug) => `未找到车系「${slug}」。`,
        seriesMetaTitle: "未找到 BMW 车系",
        backToHome: "返回首页",
        chassisHeading: "未找到底盘",
        chassisMessage: (label) => `未找到底盘代号「${label}」的 BMW 车型。`,
        chassisMetaTitle: (label) => `BMW ${label} 零件`,
        chassisMetaDescription: (label) => `浏览 BMW ${label} OEM 零件目录。`,
        back: "返回",
      },
    },
    vinLanding: {
      breadcrumbHome: "首页",
      breadcrumbVinDecoder: "VIN 解码器",
      vehicleSummary: "车辆概览",
      vehiclePhotos: "车辆照片",
      ownersManuals: n => `用户手册（${n}）`,
      factoryOptions: n => `出厂选装（${n}）`,
      bmwOemPartsCatalog: "BMW 原厂零件目录",
      factVin: "VIN",
      factChassis: "底盘",
      factModelYear: "车型年份",
      factEngine: "发动机",
      factDrivetrain: "驱动方式",
      factTransmission: "变速箱",
      factMarket: "市场",
      factPaint: "车身颜色",
      factUpholstery: "内饰",
      factBuildDate: "生产日期",
      factPlant: "生产工厂",
      exteriorCaption: "外观",
      interiorCaption: "内饰",
      exteriorAlt: ({ headline, vin }) => `${headline} 外观照片，VIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `${headline} 内饰照片,VIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `${headline} 360° 外观视图,VIN ${vin}`,
      viewer360NoscriptCaption: n => `360° 外观视图（启用 JavaScript 时可查看 ${n} 帧画面）`,
      viewer360HydrationHint: n => `360° 旋转查看器（${n} 帧）将在 JavaScript 加载后显示。`,
      manualHeaderManual: "手册",
      manualHeaderNumber: "编号",
      manualHeaderLanguage: "语言",
      manualHeaderDate: "日期",
      catalogIntro: "浏览这辆 BMW 的原厂零件。系统图、零件号、适配信息和交叉参考按系统组归类。",
      chassisLink: chassis => `浏览 BMW ${chassis} 底盘的原厂零件`,
      seriesLink: series => `了解 BMW ${series} 系列`,
      decodeAnotherLink: "解码另一辆 BMW 的 VIN",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "自有目录";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "BMW 用户手册";
          case "bimmerwork": return "bimmer.work（备用）";
          case "mdecoder": return "mdecoder（备用）";
          case "vindecoderz": return "vindecoderz（备用）";
          default: return null;
        }
      },
      preparingTitle: vin => `正在准备 VIN ${vin}…|BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts 正在获取 VIN ${vin} 的 BMW 出厂数据：车辆信息、照片、出厂选装和用户手册。请稍后刷新查看完整页面。`,
      preparingHeading: vin => `正在准备 VIN ${vin}…`,
      preparingBody:
        "我们正在通过自有数据源解码这辆 BMW 的 VIN。查询完成后，车辆照片、出厂选装和用户手册将在此显示——通常不到一分钟。",
      preparingFooterLinkText: vin => `打开 ${vin} 的 VIN 解码器`,
      notFoundTitle: vin => `未找到 VIN ${vin}|BMV.parts`,
      notFoundReasonInvalid: "该 VIN 结构不合法（长度错误或校验位无效）。",
      notFoundReasonNotBmw: "该 VIN 不属于 BMW（WMI 前缀与任何 BMW 制造商代码不匹配）。",
      notFoundReasonUncached: "我们尚未获得该 VIN 的解码记录。",
    },
  });
