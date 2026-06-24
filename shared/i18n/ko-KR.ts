// Korean (ko-KR) locale pack.

import { makePack } from "./builder";

function yearRange(start: number | null, end: number | null): string {
  if (!start) return "";
  if (!end) return `${start}년~`;
  if (start === end) return `${start}년`;
  return `${start}~${end}년`;
}

export const koKRPack = makePack({
  meta: {
    code: "ko-KR",
    prefix: "ko",
    bcp47: "ko-KR",
    nativeLabel: "한국어",
    currency: "EUR",
    regionHint: "한국 시장 기준 가격(EUR 표시)",
    isCJK: true,
  },
  conjAnd: ", ",
  conjOr: "또는",
  formatYearRange: yearRange,
  nouns: {
    engine: "엔진 시스템 부품",
    cooling: "냉각 시스템 부품",
    brake: "제동 시스템 부품",
    suspension: "섀시/서스펜션 부품",
    fuel: "연료 시스템 부품",
    exhaust: "배기 시스템 부품",
    electrical: "전기 부품",
    drivetrain: "구동계 부품",
    body: "차체/내장 부품",
    climate: "공조 시스템 부품",
    fallback: "BMW 부품",
    wrap: c => `${c} 부품`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `BMW 정품 ${desc} (부품 번호 ${partNum})는 OEM ${noun}입니다.`,
    chassisClause: ({ chassisList, multiple }) =>
      `${chassisList} ${multiple ? "등 여러 섀시 플랫폼" : "섀시"}에서 사용됩니다.`,
    fitmentClause: ({ models }) => `확인된 적합 차량은 ${models} 등이 포함됩니다`,
    yearsClause: ({ years }) => `, ${years} 모델이어를 포괄합니다.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `이 부품은 ${supersededBy}로 대체되었습니다. ${partNum}을(를) 주문하면 일반적으로 최신 리비전이 출고됩니다.`,
  },
  fitment: {
    none: "이 부품에 대한 검증된 적합성 데이터가 아직 없습니다.",
    alsoReferenced: ch => `${ch} 섀시에서도 참조됨`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}: ${topModels}`;
      if (extraCount > 0) s += ` 외 ${extraCount}종`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: "; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "OEM 부품 번호",
    searchNumber: "검색 번호",
    weight: kg => ({ label: "중량", value: `${kg} kg` }),
    quantity: "차량당 일반 수량",
    position: "장착 위치",
    catalogCategory: "카탈로그 카테고리",
    catalogPath: "카탈로그 경로",
    supersededBy: "대체 부품",
    replaces: "대체 대상",
    notes: "비고",
  },
  faq: {
    whichModels: {
      q: pn => `어떤 BMW 모델이 부품 ${pn}을(를) 사용하나요?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `부품 ${partNum}은(는) ${models}에 적합${extra > 0 ? `하며, 외 ${extra}종의 변형 모델` : ""}이며, ${chassisText} ${multiChassis ? "섀시 플랫폼들" : "섀시"}을(를) 아우릅니다.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `부품 ${partNum}은(는) ${chassisText} 섀시의 BMW 카탈로그에 표시됩니다.`,
      andMore: n => `(외 ${n}종)`,
    },
    superseded: {
      q: pn => `BMW 부품 ${pn}이(가) 대체되었나요?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `예 — BMW는 ${partNum}을(를) ${supersededBy}로 대체했습니다. 원래 번호로 주문해도 일반적으로 최신 리비전이 자동 출고됩니다.`,
      aActive: pn =>
        `BMW는 현재 ${pn}을(를) 활성 OEM 번호로 등재하고 있습니다. BMW가 대체를 발표하면 딜러 주문 시 ${pn}은(는) 자동으로 최신 리비전으로 교체됩니다.`,
    },
    weight: {
      q: pn => `부품 ${pn}의 중량은 어떻게 되나요?`,
      a: ({ partNum, desc, kg }) =>
        `BMW 카탈로그 자료에 따르면 ${desc} (${partNum})의 배송 중량은 약 ${kg} kg입니다.`,
    },
    location: {
      q: ({ desc, partNum }) => `${desc} (${partNum})는 차량의 어디에 있나요?`,
      a: ({ desc, category, subcategory }) =>
        `${desc}은(는) BMW 부품 다이어그램에서 「${category} › ${subcategory}」 항목에 등재되어 있습니다. 정확한 장착 위치와 인접 부품은 분해도를 참조하세요.`,
    },
    oemEquivalent: {
      q: pn => `${pn}의 OEM 동등 부품은 무엇인가요?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum}은(는) 그 자체가 BMW 정품(OEM) 부품 번호입니다. Mahle, Bosch, Pierburg, Hella 등 공급사의 애프터마켓 동등품을 흔히 구할 수 있으며, 비OEM 브랜드 검색 시 ${partNumberClean}을(를) 교차 참조 번호로 사용하세요.`,
    },
    quantity: {
      q: pn => `차량당 부품 ${pn}은(는) 몇 개 장착되나요?`,
      a: ({ quantity }) =>
        `BMW 카탈로그는 표기된 적합 사양에서 차량당 일반 수량을 ${quantity}로 표시합니다.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — ${chassisCodes} 적합`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `BMW 정품 OEM ${desc} (${partNum})`;
      if (chassisCodes) s += `, ${chassisCodes} 적합`;
      s += `. ${fitCount > 0 ? `BMW 모델 변형 ${fitCount}종에서 확인됨` : "BMW OEM 부품"}, 다이어그램·대체 정보·가격 제공.`;
      return s;
    },
    titleMaxChars: 60,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `BMW ${label} 섀시 플랫폼은 공장 사양 ${carCount}종을 포함합니다`;
      if (series) s += ` (${series} 패밀리)`;
      if (years) s += ` (${years})`;
      s += `. 분해도 기준 OEM 부품 ${totalPartsFmt}점을 색인했습니다.`;
      if (topCategoryNames.length > 0) {
        s += ` ${topCategoryNames.slice(0, 4).join(", ")} 카테고리의 수록이 특히 풍부합니다.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `BMW ${label} 부품 — OEM 카탈로그`;
      if (years) t += ` (${years})`;
      if (t.length > 60) t = t.slice(0, 57) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `BMW ${label} 섀시의 OEM 부품 ${totalPartsFmt}점을 모델 변형 ${carCount}종에 걸쳐 탐색하세요. BMW 정품 부품번호, 분해도, 대체 정보, 교차 참조를 제공합니다.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `BMW ${label} 섀시를 공유하는 모델은 무엇인가요?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `BMW ${label} 섀시는 공장 사양 ${carCount}종을 포함합니다${series ? ` (${series} 패밀리)` : ""}${years ? `, 생산 연도 ${years}` : ""}. 아래 모델 목록에서 각 변형의 엔진, 차체, 생산 연도를 확인하세요.`,
      partsCountQ: label => `BMW ${label} 부품은 몇 점이 색인되어 있나요?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts는 ${label} 섀시에 대해 OEM 부품번호 ${totalPartsFmt}점을 BMW 공식 ETK 카탈로그에서 가져와 PartsLink24와 교차 검증하여 색인합니다.`,
      topCategoriesQ: label => `${label}에서 가장 폭넓게 다루는 카테고리는 무엇인가요?`,
      topCategoriesA: ({ label, topList }) =>
        `${label} 섀시에서 색인된 부품 수 기준 상위 카테고리는 다음과 같습니다: ${topList}.`,
      relatedQ: label => `${label}와 관련된 다른 BMW 섀시는 무엇인가요?`,
      relatedA: ({ siblings }) =>
        `함께 살펴볼 만한 관련 BMW 섀시: ${siblings}.`,
      findRightPartQ: label => `내 차에 맞는 BMW ${label} 부품은 어떻게 찾나요?`,
      findRightPartA: () =>
        `아래에서 정확한 모델을 선택해 카탈로그에 진입하거나 VIN 디코더로 차량별 부품을 매칭하세요. 각 부품 페이지에는 적합 사양, 대체 정보, OEM 동등 공급업체 교차 참조가 포함됩니다.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `${displayName} 부품 카탈로그 — OEM 부품 및 분해도`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `${totalParts > 0 ? `${totalPartsFmt}점의 ` : ""}OEM 부품, BMW ${displayName} (${chassis}) 적합. ${modelName}${engine ? ` ${engine}` : ""}의 분해도, 부품번호, 교차 참조 제공.`.trim(),
  },
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `BMW ${label} 부품 카탈로그는 ${carCount}개의 공장 사양을 다룹니다`;
        if (chassisCodes.length > 0) {
          s += `. ${chassisCodes.length}세대 섀시(${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, 외 +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `. 총 ${totalPartsFmt}개의 BMW 정품 부품번호를 VIN, 분해도, 부품번호로 조회할 수 있습니다.`;
        if (topCategoryNames.length > 0) {
          s += ` 가장 많이 조회되는 분류: ${topCategoryNames.slice(0, 4).join(", ")}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `BMW ${label} 부품 카탈로그 — 전 세대`;
        if (years) t += `(${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `BMW ${label} 전체 부품 카탈로그 — ${totalPartsFmt}개 OEM 부품, ${carCount}개 사양`;
        if (chassisCodes.length > 0) {
          s += `, ${chassisCodes.length}세대 섀시 포함`;
        }
        s += `. BMW 정품 부품번호, 분해도, 대체 부품 데이터, 교차 참조.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `BMW ${label}에는 어떤 세대 섀시가 포함됩니까?`,
        chassisInSeriesA: ({ label, count, list }) => `BMW ${label}은(는) ${count}세대 섀시를 포함합니다: ${list}.`,
        partsCountQ: label => `BMV.parts에 BMW ${label} 부품은 몇 개나 등록되어 있습니까?`,
        partsCountA: ({ label, totalPartsFmt }) => `BMW ${label} 라인업에는 ${totalPartsFmt}개의 고유한 OEM 부품번호가 등록되어 있으며, 분해도, 적합 정보, 중량, 대체 부품 추적이 포함됩니다.`,
        topCategoriesQ: label => `${label}에서 부품이 가장 많은 분류는 무엇입니까?`,
        topCategoriesA: ({ topList }) => `색인된 부품 수 기준으로 가장 큰 BMW 분류는: ${topList}.`,
        findRightPartQ: label => `내 차에 맞는 BMW ${label} 부품을 어떻게 찾습니까?`,
        findRightPartA: () => `아래에서 정확한 모델을 선택해 카탈로그를 살펴보거나 VIN 디코더를 사용하세요. 각 부품 페이지에는 적합 정보, 대체 부품 정보, OEM 동급 공급업체 교차 참조가 표시됩니다.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `BMW 모델 변형 전체 데이터베이스 — 모든 섀시 코드에 걸친 ${totalModelsFmt}개 모델로, 항목마다 엔진, 차체 형태, 생산 연도가 포함됩니다.`,
      metaTitle: () => `BMW 모델 데이터베이스 — 모든 섀시 코드와 세대`,
      metaDescription: ({ totalModelsFmt }) => `완전한 BMW 모델 참조 데이터베이스 — 모든 섀시 코드, 엔진, 세대에 걸친 ${totalModelsFmt}개 변형. 클래식부터 현행까지 모든 BMW 모델의 기술 사양을 제공합니다.`,
    },
    modelsHubUi: {
      pageTitle: "BMW 모델 참조",
      databaseLabel: "모델 데이터베이스",
      status: { ready: "준비됨", syncing: "동기화 중...", complete: "완료", error: "오류" },
      discoveryProgress: ({ completed, discovered, current }) =>
        `섀시 탐색 중 ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
      modelsProgress: ({ scraped, total }) => `${scraped} / ${total} 모델`,
      errorsCount: n => `오류 ${n}개`,
      buttons: {
        cancel: "취소",
        refresh: "새로 고침",
        syncModels: "모델 동기화",
        importing: "가져오는 중...",
        importLegacy: "레거시 가져오기",
      },
      importLegacyTooltip: "bimmer.work에 없는 엄선된 구형 섀시(E36/E39/E46/E60/E83/E87/E90/F15) 가져오기",
      searchPlaceholder: "모델, 섀시 코드, 엔진 검색...",
      resultsBadge: n => `결과 ${n}개`,
      filterAll: "전체",
      showLess: "접기",
      showMore: n => `+${n}개 더 보기`,
      failedToLoad: "모델을 불러오지 못했습니다.",
      emptyTitle: "데이터베이스에 모델이 없습니다",
      emptyHintWithSearch: "검색과 일치하는 모델이 없습니다. 다른 검색어를 시도해 보세요.",
      emptyHintNoSearch: '위의 "모델 동기화"를 클릭하여 1,350개 이상의 BMW 모델 변형을 모두 가져오세요.',
      variantsCount: n => `${n}개 변형`,
    },
    hubLabels: {
      breadcrumbs: { home: "홈", series: "시리즈", chassis: "섀시", models: "모델" },
      stats: {
        models: "모델",
        generations: "세대",
        totalParts: "전체 부품",
        bodyTypes: "차체 유형",
        withPartsData: "부품 데이터 보유",
        parts: "부품",
      },
      sections: {
        mostStockedCategories: (label) => `${label} 부품이 가장 많은 카테고리`,
        chassisInThisSeries: "이 시리즈의 섀시",
        relatedChassis: "관련 BMW 섀시",
        frequentlyAskedQuestions: "자주 묻는 질문",
        allModelsHeading: ({ label, count }) => `전체 ${label} 모델 (${count})`,
        bodyTypesLabel: "차체 유형:",
        enginesLabel: "엔진:",
        moreEngines: (n) => `외 ${n}개`,
        productionYears: (years) => `생산연도: ${years}`,
        modelsCount: (n) => `${n}개 모델`,
        partsLowercase: "부품",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount}개 모델 · ${totalParts}개 부품`,
        browse: "살펴보기",
      },
      notFound: {
        seriesHeading: "시리즈를 찾을 수 없습니다",
        seriesMessage: (slug) => `"${slug}" 시리즈를 찾을 수 없습니다.`,
        seriesMetaTitle: "BMW 시리즈를 찾을 수 없음",
        backToHome: "홈으로 돌아가기",
        chassisHeading: "섀시를 찾을 수 없습니다",
        chassisMessage: (label) => `섀시 코드 "${label}"인 BMW 모델을 찾을 수 없습니다.`,
        chassisMetaTitle: (label) => `BMW ${label} 부품`,
        chassisMetaDescription: (label) => `BMW ${label} OEM 부품 카탈로그를 살펴보세요.`,
        back: "뒤로",
      },
    },
    vinLanding: {
      breadcrumbHome: "홈",
      breadcrumbVinDecoder: "VIN 디코더",
      vehicleSummary: "차량 요약",
      vehiclePhotos: "차량 사진",
      ownersManuals: n => `사용자 매뉴얼 (${n})`,
      factoryOptions: n => `공장 옵션 (${n})`,
      bmwOemPartsCatalog: "BMW OEM 부품 카탈로그",
      factVin: "VIN",
      factChassis: "섀시",
      factModelYear: "연식",
      factEngine: "엔진",
      factDrivetrain: "구동방식",
      factTransmission: "변속기",
      factMarket: "시장",
      factPaint: "외장 색상",
      factUpholstery: "시트 마감",
      factBuildDate: "생산일",
      factPlant: "생산 공장",
      exteriorCaption: "외관",
      interiorCaption: "실내",
      exteriorAlt: ({ headline, vin }) => `${headline} 외관, VIN ${vin}`,
      interiorAlt: ({ headline, vin }) => `${headline} 실내, VIN ${vin}`,
      viewer360Alt: ({ headline, vin }) => `${headline} 360° 외관 뷰, VIN ${vin}`,
      viewer360NoscriptCaption: n => `360° 외관 뷰 (JavaScript 활성화 시 ${n}프레임 이용 가능)`,
      viewer360HydrationHint: n => `360° 회전 뷰어(${n}프레임)는 JavaScript 하이드레이션 후 표시됩니다.`,
      manualHeaderManual: "매뉴얼",
      manualHeaderNumber: "번호",
      manualHeaderLanguage: "언어",
      manualHeaderDate: "날짜",
      catalogIntro: "이 BMW의 OEM 부품을 살펴보세요. 다이어그램, 부품 번호, 적용 모델 및 교차 참조가 시스템 그룹별로 정리되어 있습니다.",
      chassisLink: chassis => `BMW ${chassis} 섀시 OEM 부품 살펴보기`,
      seriesLink: series => `BMW ${series} 시리즈 살펴보기`,
      decodeAnotherLink: "다른 BMW VIN 디코딩",
      sourceLabel: source => {
        switch (source) {
          case "etk": return "자체 카탈로그";
          case "bmw_configurator": return "BMW Configurator";
          case "bmw_manuals": return "BMW 사용자 매뉴얼";
          case "bimmerwork": return "bimmer.work (대체)";
          case "mdecoder": return "mdecoder (대체)";
          case "vindecoderz": return "vindecoderz (대체)";
          default: return null;
        }
      },
      preparingTitle: vin => `VIN ${vin} 준비 중… | BMV.parts`,
      preparingMetaDescription: vin =>
        `BMV.parts가 VIN ${vin}의 BMW 공장 데이터(차량 정보, 사진, 공장 옵션, 사용자 매뉴얼)를 가져오고 있습니다. 잠시 후 새로고침하면 전체 페이지를 볼 수 있습니다.`,
      preparingHeading: vin => `VIN ${vin} 준비 중…`,
      preparingBody:
        "자체 데이터 소스에서 이 BMW VIN을 디코딩하고 있습니다. 차량 사진, 공장 옵션, 사용자 매뉴얼은 조회가 완료되는 즉시 여기에 표시됩니다 — 보통 1분 이내입니다.",
      preparingFooterLinkText: vin => `${vin}의 VIN 디코더 열기`,
      notFoundTitle: vin => `VIN ${vin}을(를) 찾을 수 없음 | BMV.parts`,
      notFoundReasonInvalid: "이 VIN은 구조적으로 유효하지 않습니다 (잘못된 길이 또는 무효한 체크 디지트).",
      notFoundReasonNotBmw: "이 VIN은 BMW가 아닙니다 (WMI 접두사가 BMW 제조사 코드와 일치하지 않음).",
      notFoundReasonUncached: "이 VIN에 대한 디코딩된 기록이 아직 없습니다.",
    },
  });
