// Builds the BMW SA / paint / upholstery dictionary JSON files
// consumed by `server/dictionaries-import.ts` (Task #60).
//
// Run with:  tsx scripts/build-dictionaries.ts
//
// Source material: BMW factory FA / SALAPA tables, BMW configurator
// brochures and BMW Press Service descriptions. We deliberately keep
// translations at parity with the seed file's six locales (en, de, es,
// fr, it, zh). Where BMW publishes an official localized name (via
// configurator.bmw.de / .es / .fr / .it / .com.cn) we mirror that
// wording; the rest are conservative literal translations.
//
// Each tuple is `[code, category, en, de, es, fr, it, zh]`. Paint /
// upholstery tuples additionally carry the finish/material + an
// approximate sRGB swatch hex.

import { writeFile, mkdir } from "fs/promises";
import path from "path";

type SaTuple = [string, string, string, string, string, string, string, string];
type PaintTuple = [string, string | null, string | null, string, string, string, string, string, string];
type UpholTuple = [string, string | null, string | null, string, string, string, string, string, string];

// ---------------------------------------------------------------------------
// SA codes
// ---------------------------------------------------------------------------
const SA_CODES: SaTuple[] = [
  // -- Transmission / drivetrain ------------------------------------------
  ["S205", "transmission", "Automatic transmission", "Automatik-Getriebe", "Caja de cambios automática", "Boîte de vitesses automatique", "Cambio automatico", "自动变速箱"],
  ["S206", "transmission", "Automatic transmission with double clutch", "Automatik-Getriebe mit Doppelkupplung", "Caja automática de doble embrague", "Boîte automatique à double embrayage", "Cambio automatico a doppia frizione", "双离合自动变速箱"],
  ["S2VB", "transmission", "Sport automatic transmission", "Sport-Automatic-Getriebe", "Caja de cambios automática deportiva", "Boîte de vitesses automatique sport", "Cambio automatico sportivo", "运动型自动变速箱"],
  ["S2VL", "transmission", "8-speed Steptronic Sport transmission", "8-Gang-Steptronic Sport Getriebe", "Cambio Steptronic Sport de 8 velocidades", "Boîte Steptronic Sport 8 rapports", "Cambio Steptronic Sport a 8 rapporti", "8速 Steptronic Sport 变速箱"],
  ["S2TB", "drivetrain", "M Sport differential", "M Sportdifferenzial", "Diferencial M Sport", "Différentiel M Sport", "Differenziale M Sport", "M 运动差速器"],
  ["S2T4", "drivetrain", "M Sport differential", "M Sportdifferenzial", "Diferencial M Sport", "Différentiel M Sport", "Differenziale M Sport", "M 运动差速器"],
  ["S2VC", "wheels", "Tyre repair set", "Reifen-Reparaturset", "Kit de reparación de neumáticos", "Kit de réparation des pneus", "Kit di riparazione pneumatici", "轮胎修补套件"],
  ["S2VF", "chassis", "Adaptive M chassis", "Adaptives M Fahrwerk", "Suspensión M adaptativa", "Châssis M adaptatif", "Assetto M adattivo", "M 自适应底盘"],
  ["S2VR", "chassis", "Adaptive suspension", "Adaptives Fahrwerk", "Suspensión adaptativa", "Suspension adaptative", "Sospensioni adattive", "自适应悬挂"],
  ["S2NH", "chassis", "M Sport package Pro", "M Sportpaket Pro", "Paquete M Sport Pro", "Pack M Sport Pro", "Pacchetto M Sport Pro", "M 运动套装 Pro"],

  // -- Engine / starter ---------------------------------------------------
  ["SL070", "battery", "70 Ah battery", "Batterie 70 Ah", "Batería de 70 Ah", "Batterie 70 Ah", "Batteria 70 Ah", "70 安时蓄电池"],
  ["SL072", "battery", "72 Ah battery", "Batterie 72 Ah", "Batería de 72 Ah", "Batterie 72 Ah", "Batteria 72 Ah", "72 安时蓄电池"],
  ["SL080", "battery", "80 Ah battery", "Batterie 80 Ah", "Batería de 80 Ah", "Batterie 80 Ah", "Batteria 80 Ah", "80 安时蓄电池"],
  ["SL090", "battery", "90 Ah battery", "Batterie 90 Ah", "Batería de 90 Ah", "Batterie 90 Ah", "Batteria 90 Ah", "90 安时蓄电池"],

  // -- Wheels & tyres -----------------------------------------------------
  ["S1T8", "wheels", "BMW M light-alloy wheel 826M", "BMW M Leichtmetallrad 826 M", "Llanta de aleación ligera BMW M 826M", "Jante en alliage léger BMW M 826M", "Cerchio in lega BMW M 826M", "BMW M 轻合金轮毂 826M"],
  ["S1T9", "wheels", "BMW M light-alloy wheel 825M", "BMW M Leichtmetallrad 825 M", "Llanta de aleación ligera BMW M 825M", "Jante en alliage léger BMW M 825M", "Cerchio in lega BMW M 825M", "BMW M 轻合金轮毂 825M"],
  ["S2H1", "wheels", "Light-alloy wheels with mixed tyres", "Leichtmetallräder mit Mischbereifung", "Llantas de aleación ligera con neumáticos mixtos", "Jantes en alliage léger avec pneus mixtes", "Cerchi in lega con pneumatici misti", "轻合金轮毂带混合轮胎"],
  ["S2H2", "wheels", "Light-alloy wheels", "Leichtmetallräder", "Llantas de aleación ligera", "Jantes en alliage léger", "Cerchi in lega leggera", "轻合金轮毂"],
  ["S2H6", "wheels", "M light-alloy wheels", "M Leichtmetallräder", "Llantas de aleación M", "Jantes en alliage M", "Cerchi in lega M", "M 轻合金轮毂"],

  // -- M / Sport packages -------------------------------------------------
  ["S1MB", "package", "M Drive Professional", "M Drive Professional", "M Drive Professional", "M Drive Professional", "M Drive Professional", "M Drive Professional"],
  ["S1NA", "package", "M Sport package", "M Sportpaket", "Paquete M Sport", "Pack M Sport", "Pacchetto M Sport", "M 运动套装"],
  ["S2T6", "package", "M Sport brakes", "M Sportbremse", "Frenos M Sport", "Freins M Sport", "Freni M Sport", "M 运动刹车系统"],
  ["S337", "package", "M Sport package", "M Sportpaket", "Paquete M Sport", "Pack M Sport", "Pacchetto M Sport", "M 运动套装"],
  ["S336", "package", "Sport package", "Sportpaket", "Paquete deportivo", "Pack Sport", "Pacchetto Sport", "运动套装"],
  ["S320", "package", "Premium package", "Premium-Paket", "Paquete Premium", "Pack Premium", "Pacchetto Premium", "高级套装"],
  ["S319", "package", "Comfort package", "Komfort-Paket", "Paquete Confort", "Pack Confort", "Pacchetto Comfort", "舒适套装"],
  ["S230", "package", "European-specific equipment", "Sonderausstattung Europa", "Equipamiento específico europeo", "Équipements spécifiques Europe", "Equipaggiamenti specifici per l'Europa", "欧洲专属配置"],
  ["S231", "package", "Office package", "Office-Paket", "Paquete Office", "Pack Office", "Pacchetto Office", "办公套装"],

  // -- Steering / interior switches --------------------------------------
  ["S255", "interior", "Sport leather steering wheel", "Sport-Lederlenkrad", "Volante deportivo de cuero", "Volant sport en cuir", "Volante sportivo in pelle", "运动型真皮方向盘"],
  ["S2MK", "interior", "M leather steering wheel", "M Lederlenkrad", "Volante M de cuero", "Volant M en cuir", "Volante M in pelle", "M 真皮方向盘"],
  ["S2ML", "interior", "M leather steering wheel with shift paddles", "M Lederlenkrad mit Schaltwippen", "Volante M de cuero con levas de cambio", "Volant M en cuir avec palettes au volant", "Volante M in pelle con palette del cambio", "带换挡拨片的 M 真皮方向盘"],
  ["S256", "interior", "Multi-function steering wheel", "Multifunktions-Lenkrad", "Volante multifunción", "Volant multifonction", "Volante multifunzione", "多功能方向盘"],
  ["S257", "interior", "Heated steering wheel", "Lenkradheizung", "Volante con calefacción", "Volant chauffant", "Volante riscaldato", "方向盘加热"],

  // -- Headrests / seats --------------------------------------------------
  ["S459", "interior", "Electric seat adjustment with memory", "Sitzverstellung elektrisch mit Memory", "Ajuste eléctrico de asientos con memoria", "Sièges à réglage électrique avec mémoire", "Regolazione elettrica dei sedili con memoria", "带记忆功能的电动座椅调节"],
  ["S488", "interior", "Lumbar support, driver and passenger", "Lordosenstütze für Fahrer und Beifahrer", "Soporte lumbar para conductor y acompañante", "Soutien lombaire pour conducteur et passager", "Supporto lombare per conducente e passeggero", "驾驶席与副驾席腰部支撑"],
  ["S493", "interior", "Storage compartment package", "Ablagenpaket", "Paquete de compartimentos portaobjetos", "Pack rangements", "Pacchetto vani portaoggetti", "储物空间套装"],
  ["S494", "interior", "Heated front seats", "Sitzheizung Fahrer/Beifahrer", "Calefacción de asientos delanteros", "Sièges avant chauffants", "Riscaldamento sedili anteriori", "前排座椅加热"],
  ["S496", "interior", "Heated rear seats", "Sitzheizung Fond", "Calefacción de asientos traseros", "Sièges arrière chauffants", "Riscaldamento sedili posteriori", "后排座椅加热"],
  ["S456", "interior", "Comfort seats, driver and passenger", "Komfortsitze Fahrer und Beifahrer", "Asientos confort para conductor y acompañante", "Sièges confort conducteur et passager", "Sedili comfort conducente e passeggero", "驾驶席与副驾席舒适座椅"],
  ["S458", "interior", "Sport seats, driver and passenger", "Sportsitze Fahrer und Beifahrer", "Asientos deportivos para conductor y acompañante", "Sièges sport conducteur et passager", "Sedili sportivi conducente e passeggero", "驾驶席与副驾席运动座椅"],
  ["S481", "interior", "Sport seats", "Sportsitze", "Asientos deportivos", "Sièges sport", "Sedili sportivi", "运动座椅"],
  ["S48C", "interior", "M Carbon bucket seats", "M Carbon-Schalensitze", "Asientos baquet M Carbon", "Sièges baquet M Carbon", "Sedili a guscio M Carbon", "M Carbon 桶形座椅"],
  ["S48H", "interior", "M Sport seats", "M Sportsitze", "Asientos M Sport", "Sièges M Sport", "Sedili M Sport", "M 运动座椅"],
  ["S4F1", "interior", "Active seat ventilation", "Aktive Sitzbelüftung", "Ventilación activa de asientos", "Ventilation active des sièges", "Ventilazione attiva dei sedili", "主动式座椅通风"],
  ["S4FL", "interior", "Massage function for front seats", "Massagefunktion Vordersitze", "Función de masaje en asientos delanteros", "Fonction massage des sièges avant", "Funzione massaggio sedili anteriori", "前排座椅按摩功能"],
  ["S4GQ", "interior", "M seat belts", "M Sicherheitsgurte", "Cinturones de seguridad M", "Ceintures de sécurité M", "Cinture di sicurezza M", "M 安全带"],
  ["S465", "interior", "Through-loading system", "Durchladesystem", "Sistema de carga pasante", "Système de chargement traversant", "Sistema di carico passante", "贯穿式装载系统"],
  ["S4T7", "interior", "Floor mats in velour", "Velours-Fußmatten", "Alfombrillas de velour", "Tapis de sol en velours", "Tappetini in velour", "丝绒脚垫"],
  ["S4MC", "interior", "Carbon fibre interior trims", "Innenleisten Carbon", "Embellecedores interiores en fibra de carbono", "Décors intérieurs en fibre de carbone", "Modanature interne in fibra di carbonio", "碳纤维内饰"],
  ["S4FK", "interior", "Aluminium Rhombicle interior trim", "Interieurleisten Aluminium Rhombicle", "Embellecedores interiores en aluminio Rhombicle", "Décors intérieurs en aluminium Rhombicle", "Modanature interne in alluminio Rhombicle", "Rhombicle 铝制内饰"],
  ["S4FM", "interior", "Aluminium Tetragon interior trim", "Interieurleisten Aluminium Tetragon", "Embellecedores interiores en aluminio Tetragon", "Décors intérieurs en aluminium Tetragon", "Modanature interne in alluminio Tetragon", "Tetragon 铝制内饰"],
  ["S4U0", "interior", "Electroplated cover for control elements", "Galvanisierte Blenden für Bedienelemente", "Embellecedores galvanizados de los mandos", "Habillages galvanisés des commandes", "Cornici galvanizzate degli elementi di comando", "电镀控制元件饰条"],
  ["S4U1", "interior", "Ambient interior lighting", "Ambientes Licht", "Iluminación ambiental interior", "Éclairage d'ambiance intérieur", "Illuminazione ambient interna", "氛围照明"],

  // -- Comfort / convenience ---------------------------------------------
  ["S322", "comfort", "Comfort access", "Komfortzugang", "Acceso confort", "Accès confort", "Accesso confort", "舒适进入系统"],
  ["S302", "comfort", "Alarm system", "Alarmanlage", "Sistema de alarma", "Système d'alarme", "Sistema d'allarme", "防盗报警系统"],
  ["S316", "comfort", "Automatic tailgate operation", "Automatische Heckklappenbetätigung", "Apertura automática del portón trasero", "Hayon à ouverture automatique", "Portellone posteriore ad apertura automatica", "电动尾门"],
  ["S313", "comfort", "Soft-close automatic for doors", "Soft Close Automatik für Türen", "Cierre automático suave de puertas", "Fermeture automatique douce des portes", "Chiusura automatica dolce delle porte", "门自动软关闭"],
  ["S407", "comfort", "Sun-protection glazing", "Sonnenschutz-Verglasung", "Cristales atérmicos", "Vitrage athermique", "Vetri atermici", "防晒玻璃"],
  ["S420", "comfort", "Sun-blinds for rear side windows", "Sonnenrollos für Seitenfenster hinten", "Cortinillas para ventanillas traseras", "Rideaux pare-soleil arrière", "Tendine parasole posteriori", "后侧窗遮阳帘"],
  ["S423", "comfort", "Floor mats, velours", "Fußmatten Velours", "Alfombrillas de velour", "Tapis de sol velours", "Tappetini in velour", "丝绒脚垫"],
  ["S428", "comfort", "Warning triangle and first-aid kit", "Warndreieck und Verbandstasche", "Triángulo de emergencia y botiquín", "Triangle de signalisation et trousse de premiers secours", "Triangolo d'emergenza e kit di pronto soccorso", "警示三角架和急救包"],
  ["S430", "comfort", "Interior/exterior mirror with auto-dip", "Innen-/Außenspiegel mit Abblendautomatik", "Espejo interior/exterior fotosensible", "Rétroviseurs intérieur et extérieur électrochromes", "Specchio interno/esterno fotocromatico", "内外后视镜自动防眩"],
  ["S431", "comfort", "Interior mirror with automatic anti-dazzle", "Innenspiegel mit Abblendautomatik", "Espejo interior fotosensible", "Rétroviseur intérieur électrochrome", "Specchio interno fotocromatico", "内后视镜自动防眩"],
  ["S521", "comfort", "Rain sensor with auto headlight activation", "Regensensor mit Lichtautomatik", "Sensor de lluvia con luces automáticas", "Capteur de pluie et allumage automatique des feux", "Sensore pioggia con accensione automatica luci", "雨量感应器和大灯自动控制"],
  ["S534", "comfort", "Automatic air conditioning", "Klimaautomatik", "Climatización automática", "Climatisation automatique", "Climatizzatore automatico", "自动空调"],
  ["S544", "comfort", "Cruise control", "Geschwindigkeits-Regelung", "Control de velocidad de crucero", "Régulateur de vitesse", "Cruise control", "定速巡航"],
  ["S548", "comfort", "Speedometer in km/h", "Tacho in km/h", "Velocímetro en km/h", "Compteur de vitesse en km/h", "Tachimetro in km/h", "公里/小时速度表"],
  ["S563", "comfort", "Light package", "Lichtpaket", "Paquete de iluminación", "Pack lumière", "Pacchetto luci", "灯光套装"],
  ["S575", "comfort", "Cigarette lighter and ashtray", "Anzünder und Ascher", "Encendedor y cenicero", "Allume-cigare et cendrier", "Accendisigari e portacenere", "点烟器和烟灰缸"],
  ["S5DC", "comfort", "Folding rear-seat headrests", "Klappbare Kopfstützen hinten", "Reposacabezas traseros abatibles", "Appuie-tête arrière rabattables", "Poggiatesta posteriori ribaltabili", "后排可折叠头枕"],
  ["S5DN", "assistance", "Parking Assistant Plus", "Parkassistent Plus", "Asistente de aparcamiento Plus", "Assistant de stationnement Plus", "Parking Assistant Plus", "停车辅助系统 Plus"],
  ["S5DP", "assistance", "Park Distance Control front and rear", "Park Distance Control vorn und hinten", "Sensores de aparcamiento delante y detrás", "Aide au stationnement avant et arrière", "Park Distance Control anteriore e posteriore", "前后驻车距离控制"],

  // -- Driver assistance / lighting --------------------------------------
  ["S5AC", "assistance", "High-beam assistant", "Fernlichtassistent", "Asistente de luces de carretera", "Assistant de feux de route", "Assistente abbaglianti", "远光辅助"],
  ["S5AL", "assistance", "Active Protection", "Active Protection", "Protección activa", "Protection active", "Active Protection", "主动保护系统"],
  ["S5AS", "assistance", "Active cruise control with stop & go", "Aktive Geschwindigkeitsregelung mit Stop & Go", "Control de crucero activo con función Stop & Go", "Régulateur de vitesse actif avec fonction Stop & Go", "Cruise control attivo con funzione Stop & Go", "带 Stop & Go 的主动巡航"],
  ["S5AT", "assistance", "Driving Assistant", "Driving Assistant", "Driving Assistant", "Driving Assistant", "Driving Assistant", "驾驶辅助系统"],
  ["S5AU", "assistance", "Driving Assistant Professional", "Driving Assistant Professional", "Driving Assistant Professional", "Driving Assistant Professional", "Driving Assistant Professional", "驾驶辅助系统 Professional"],
  ["S5AV", "assistance", "Active Guard", "Active Guard", "Active Guard", "Active Guard", "Active Guard", "主动安全防护"],
  ["S5AZ", "lighting", "BMW Laserlight", "BMW Laserlicht", "Faros BMW Laserlight", "BMW Laserlight", "BMW Laserlight", "BMW 激光大灯"],
  ["S524", "lighting", "Adaptive headlights", "Adaptive LED-Scheinwerfer", "Faros adaptativos", "Phares adaptatifs", "Fari adattivi", "自适应前大灯"],
  ["S552", "lighting", "Adaptive LED headlights", "Adaptive LED-Scheinwerfer", "Faros LED adaptativos", "Phares LED adaptatifs", "Fari LED adattivi", "自适应 LED 大灯"],
  ["S3MF", "lighting", "M Shadowline lights", "M Lights Shadow Line", "Luces Shadow Line M", "Optiques Shadow Line M", "Luci Shadow Line M", "M 暗黑线条灯组"],
  ["S3MA", "lighting", "Adaptive headlights with cornering function", "Adaptive Scheinwerfer mit Kurvenlicht", "Faros adaptativos con luz de curva", "Phares adaptatifs avec éclairage en virage", "Fari adattivi con luce in curva", "带转向辅助的自适应大灯"],
  ["S5DF", "assistance", "Surround View with 3D View", "Umgebungsansicht mit 3D-Ansicht", "Surround View con visión 3D", "Vue panoramique avec vue 3D", "Surround View con vista 3D", "全景影像与 3D 视图"],

  // -- Audio / infotainment ----------------------------------------------
  ["S609", "infotainment", "Navigation system Professional", "Navigationssystem Professional", "Sistema de navegación Professional", "Système de navigation Professionnel", "Sistema di navigazione Professional", "专业导航系统"],
  ["S610", "infotainment", "Head-up display", "Head-Up Display", "Head-Up Display", "Head-Up Display", "Head-Up Display", "平视显示器"],
  ["S614", "infotainment", "WLAN Hotspot", "WLAN Hotspot", "Punto de acceso WLAN", "Hotspot WLAN", "Hotspot WLAN", "无线热点"],
  ["S615", "infotainment", "BMW Operating System 8", "BMW Operating System 8", "BMW Operating System 8", "BMW Operating System 8", "BMW Operating System 8", "BMW 操作系统 8"],
  ["S620", "infotainment", "Voice control", "Sprachsteuerung", "Control por voz", "Commande vocale", "Comando vocale", "语音控制"],
  ["S627", "infotainment", "BMW Online", "BMW Online", "BMW Online", "BMW Online", "BMW Online", "BMW Online"],
  ["S654", "infotainment", "DAB tuner", "DAB-Tuner", "Sintonizador DAB", "Tuner DAB", "Sintonizzatore DAB", "DAB 数字广播"],
  ["S655", "infotainment", "Satellite radio preparation", "Vorbereitung SatRadio", "Preparación para radio por satélite", "Préparation radio satellite", "Predisposizione radio satellitare", "卫星广播预装"],
  ["S676", "infotainment", "HiFi loudspeaker system", "HiFi Lautsprecher System", "Sistema de altavoces HiFi", "Système haut-parleurs HiFi", "Sistema altoparlanti HiFi", "HiFi 音响系统"],
  ["S688", "infotainment", "Harman Kardon surround sound system", "Harman Kardon Surround Sound System", "Sistema de sonido envolvente Harman Kardon", "Système son surround Harman Kardon", "Sistema audio surround Harman Kardon", "Harman Kardon 环绕音响系统"],
  ["S6F1", "infotainment", "Bowers & Wilkins Diamond surround sound", "Bowers & Wilkins Diamond Surround Sound", "Sonido envolvente Bowers & Wilkins Diamond", "Son surround Bowers & Wilkins Diamond", "Sistema audio Bowers & Wilkins Diamond", "Bowers & Wilkins Diamond 环绕音响"],
  ["S6FL", "infotainment", "Apple CarPlay preparation", "Apple CarPlay Vorbereitung", "Preparación para Apple CarPlay", "Préparation Apple CarPlay", "Predisposizione Apple CarPlay", "Apple CarPlay 预装"],
  ["S6NS", "infotainment", "Smartphone integration", "Smartphone-Integration", "Integración del smartphone", "Intégration du smartphone", "Integrazione smartphone", "智能手机集成"],
  ["S6NV", "infotainment", "Telephony with wireless charging", "Telefonie mit Wireless Charging", "Telefonía con carga inalámbrica", "Téléphonie avec recharge sans fil", "Telefonia con ricarica wireless", "无线充电与电话功能"],
  ["S6U3", "infotainment", "BMW Live Cockpit Professional", "BMW Live Cockpit Professional", "BMW Live Cockpit Professional", "BMW Live Cockpit Professional", "BMW Live Cockpit Professional", "BMW 智能驾驶座舱 Professional"],
  ["S6WB", "infotainment", "Live Cockpit Plus", "Live Cockpit Plus", "Live Cockpit Plus", "Live Cockpit Plus", "Live Cockpit Plus", "智能驾驶座舱 Plus"],
  ["S6WC", "infotainment", "BMW Curved Display", "BMW Curved Display", "BMW Curved Display", "BMW Curved Display", "BMW Curved Display", "BMW 曲面显示屏"],
  ["S6WD", "infotainment", "Augmented View navigation", "Augmented View Navigation", "Navegación con vista aumentada", "Navigation Augmented View", "Navigazione Augmented View", "增强现实导航"],

  // -- ConnectedDrive ----------------------------------------------------
  ["S6AC", "connected", "Intelligent Emergency Call", "Intelligenter Notruf", "Llamada de emergencia inteligente", "Appel d'urgence intelligent", "Chiamata d'emergenza intelligente", "智能紧急呼叫"],
  ["S6AE", "connected", "Teleservices", "TeleServices", "Servicios remotos", "TeleServices", "TeleServices", "远程服务"],
  ["S6AK", "connected", "ConnectedDrive Services", "ConnectedDrive Services", "Servicios ConnectedDrive", "Services ConnectedDrive", "Servizi ConnectedDrive", "ConnectedDrive 服务"],
  ["S6AP", "connected", "Remote Services", "Remote Services", "Servicios remotos", "Remote Services", "Remote Services", "远程服务"],
  ["S6C3", "connected", "Connected Package Professional", "Connected Package Professional", "Connected Package Professional", "Connected Package Professional", "Connected Package Professional", "Connected Package Professional"],
  ["S6C4", "connected", "Real-time traffic information", "Echtzeit-Verkehrsinformationen", "Información de tráfico en tiempo real", "Informations trafic en temps réel", "Informazioni sul traffico in tempo reale", "实时路况信息"],

  // -- Body / region / accessories ---------------------------------------
  ["S2NK", "exterior", "M Carbon exterior package", "M Carbon Exterieurpaket", "Paquete M Carbon Exterior", "Pack M Carbon Extérieur", "Pacchetto M Carbon Esterno", "M Carbon 外饰套装"],
  ["S715", "exterior", "M Aerodynamics package", "M Aerodynamikpaket", "Paquete aerodinámico M", "Pack aérodynamique M", "Pacchetto aerodinamico M", "M 空气动力学套装"],
  ["S760", "exterior", "BMW Individual high-gloss Shadow Line", "BMW Individual Hochglanz Shadow Line", "BMW Individual Shadow Line de alto brillo", "BMW Individual Shadow Line brillant", "BMW Individual Shadow Line lucido", "BMW Individual 高光泽暗色饰条"],
  ["S775", "exterior", "Anthracite headliner", "Dachhimmel Anthrazit", "Techo interior antracita", "Pavillon anthracite", "Cielo abitacolo antracite", "炭黑色车顶内衬"],
  ["S7M9", "exterior", "M Shadowline extended trim", "M Shadow Line mit erweiterten Umfängen", "M Shadow Line con embellecedores ampliados", "M Shadow Line étendue", "M Shadow Line estesa", "M 暗黑线条扩展饰件"],
  ["S704", "exterior", "M Sport suspension", "M Sportfahrwerk", "Suspensión M Sport", "Suspension M Sport", "Sospensioni M Sport", "M 运动悬挂"],
  ["S710", "exterior", "M leather steering wheel", "M Lederlenkrad", "Volante M de cuero", "Volant M en cuir", "Volante M in pelle", "M 真皮方向盘"],
  ["S850", "exterior", "Country option Germany", "Länderausführung Deutschland", "Versión país Alemania", "Version pays Allemagne", "Versione paese Germania", "国家版本：德国"],
  ["S879", "exterior", "On-board literature, German", "Bordliteratur Deutsch", "Documentación a bordo en alemán", "Documentation à bord en allemand", "Manualistica di bordo in tedesco", "车载手册（德语）"],
  ["S880", "exterior", "On-board literature, English", "Bordliteratur Englisch", "Documentación a bordo en inglés", "Documentation à bord en anglais", "Manualistica di bordo in inglese", "车载手册（英语）"],
  ["S853", "exterior", "Language version, English", "Sprachausführung Englisch", "Versión idioma inglés", "Version langue anglaise", "Versione lingua inglese", "语言版本：英语"],
  ["S810", "exterior", "Country option Australia", "Länderausführung Australien", "Versión país Australia", "Version pays Australie", "Versione paese Australia", "国家版本：澳大利亚"],
  ["S825", "exterior", "Radio control Oceania", "Radioausführung Ozeanien", "Versión de radio Oceanía", "Version radio Océanie", "Versione radio Oceania", "大洋洲版广播"],

  // -- "Tracking" SALAPA flags often carried in FA -----------------------
  ["S8EK", "tracking", "Placeholder SALAPA marker", "Dummy-SALAPA Markierung", "Marcador SALAPA de relleno", "Marqueur SALAPA de remplissage", "Marcatore SALAPA segnaposto", "占位 SALAPA 标记"],
  ["S8KA", "service", "Oil-service interval 24 months / 30,000 km", "Ölservice-Intervall 24 Monate / 30.000 km", "Intervalo de servicio de aceite 24 meses / 30.000 km", "Intervalle de vidange 24 mois / 30 000 km", "Intervallo cambio olio 24 mesi / 30.000 km", "机油保养周期 24 个月 / 30,000 公里"],
  ["S8KP", "service", "Condition Based Service", "Condition Based Service", "Servicio según condiciones", "Service selon conditions", "Service basato sulle condizioni", "基于状况的保养"],
  ["S8S3", "service", "Automatic locking when starting off", "Automatische Verriegelung beim Anfahren", "Bloqueo automático al arrancar", "Verrouillage automatique au démarrage", "Bloccaggio automatico all'avvio", "起步时自动落锁"],
  ["S8SM", "service", "Vehicle ID number visible from outside", "Fahrzeug-Ident-Nr. von außen sichtbar", "Número de identificación visible desde el exterior", "Numéro d'identification visible de l'extérieur", "Numero di telaio visibile dall'esterno", "车辆识别号外部可见"],
  ["S8SX", "service", "Telematics provider control", "Providersteuerung Telematik", "Control de proveedor de telemática", "Pilotage opérateur télématique", "Gestione provider telematica", "远程信息提供商控制"],
  ["S8TF", "service", "Active pedestrian protection", "Aktiver Fußgängerschutz", "Protección activa de peatones", "Protection active des piétons", "Protezione attiva pedoni", "主动行人保护"],
  ["S8TG", "service", "Anti-theft device", "Diebstahlsicherung", "Dispositivo antirrobo", "Dispositif antivol", "Dispositivo antifurto", "防盗装置"],
  ["S8TR", "service", "Coding for additional functions", "Codierung Zusatzfunktionen", "Codificación de funciones adicionales", "Codage de fonctions supplémentaires", "Codifica funzioni aggiuntive", "附加功能编码"],
  ["S8TT", "service", "BMW TeleServices included", "BMW TeleServices integriert", "BMW TeleServices incluidos", "BMW TeleServices inclus", "BMW TeleServices inclusi", "包含 BMW 远程服务"],
  ["S99A", "service", "Number-plate holder mounting", "Steuerung Kennzeichenbefestigung", "Soporte de matrícula", "Support de plaque d'immatriculation", "Supporto targa", "车牌固定装置"],
  ["S925", "tracking", "Placeholder SALAPA marker", "Dummy-SALAPA Markierung", "Marcador SALAPA de relleno", "Marqueur SALAPA de remplissage", "Marcatore SALAPA segnaposto", "占位 SALAPA 标记"],

  // -- Tyre / monitoring -------------------------------------------------
  ["S393", "tyres", "Tyre pressure monitoring", "Reifendruck-Kontrolle", "Control de presión de neumáticos", "Contrôle de pression des pneus", "Controllo pressione pneumatici", "胎压监测"],
  ["S401", "comfort", "Panoramic glass roof", "Panorama-Glasdach", "Techo panorámico de cristal", "Toit en verre panoramique", "Tetto panoramico in vetro", "全景玻璃天窗"],
  ["S402", "comfort", "Panorama glass roof Sky Lounge", "Panorama-Glasdach Sky Lounge", "Techo panorámico Sky Lounge", "Toit panoramique Sky Lounge", "Tetto panoramico Sky Lounge", "Sky Lounge 全景玻璃天窗"],
  ["S413", "comfort", "Roof rails", "Dachreling", "Barras de techo", "Barres de toit", "Mancorrenti sul tetto", "车顶行李架"],
  ["S418", "comfort", "Stowage net for partition net", "Trennnetz", "Red separadora", "Filet de séparation", "Rete divisoria", "分隔网"],
  ["S502", "wheels", "Headlight cleaning system", "Scheinwerferreinigung", "Lavafaros", "Lave-phares", "Lavafari", "大灯清洗装置"],
  ["S508", "wheels", "Park Distance Control rear", "Park Distance Control hinten", "Sensor de aparcamiento trasero", "Aide au stationnement arrière", "Park Distance Control posteriore", "后驻车雷达"],
  ["S522", "wheels", "Xenon headlights", "Xenon-Scheinwerfer", "Faros de xenón", "Phares au xénon", "Fari allo xeno", "氙气大灯"],

  // -- Paint / upholstery markers also stored as SA codes -----------------
  ["S475", "paint-marker", "Paint: Black-Sapphire metallic", "Lackierung: Saphirschwarz metallic", "Pintura: Negro Zafiro metalizado", "Peinture: noir saphir métallisé", "Vernice: Nero Zaffiro metallizzato", "车漆：蓝宝石黑金属漆"],
  ["S668", "paint-marker", "Paint: Jet Black non-metallic", "Lackierung: Schwarz uni", "Pintura: Negro liso", "Peinture: noir uni", "Vernice: Nero non metallizzato", "车漆：纯黑漆"],
  ["S300", "paint-marker", "Paint: Alpine White III", "Lackierung: Alpinweiß III", "Pintura: Blanco Alpino III", "Peinture: blanc Alpin III", "Vernice: Bianco Alpino III", "车漆：阿尔卑斯白 III"],
  ["SX3KX", "upholstery-marker", "Full leather Merino, Kyalami orange / black", "Vollleder Merino Kyalami orange/schwarz", "Cuero Merino completo, naranja Kyalami / negro", "Cuir intégral Merino, orange Kyalami / noir", "Pelle Merino integrale, arancione Kyalami / nero", "全 Merino 真皮，Kyalami 橙/黑"],
  ["SX3SW", "upholstery-marker", "Full leather Merino, black", "Vollleder Merino schwarz", "Cuero Merino completo, negro", "Cuir intégral Merino noir", "Pelle Merino integrale nera", "全 Merino 真皮，黑色"],

  // -- Legacy P-prefix variants ------------------------------------------
  ["P337A", "package", "M Sport package", "M Sportpaket", "Paquete M Sport", "Pack M Sport", "Pacchetto M Sport", "M 运动套装"],
  ["P7LDA", "package", "Cold-Weather package", "Cold-Weather-Paket", "Paquete clima frío", "Pack climat froid", "Pacchetto clima freddo", "寒冷气候套装"],
  ["P7M0A", "package", "Premium package", "Premium-Paket", "Paquete Premium", "Pack Premium", "Pacchetto Premium", "高级套装"],
  ["P7P0A", "package", "Driving Assistance Professional", "Driving Assistance Professional", "Driving Assistance Professional", "Driving Assistance Professional", "Driving Assistance Professional", "驾驶辅助专业版"],
  ["P7M2A", "package", "Executive package", "Executive-Paket", "Paquete Executive", "Pack Executive", "Pacchetto Executive", "行政套装"],
  ["P7P9A", "package", "Parking Assistance package", "Parkassistenz-Paket", "Paquete asistencia al aparcamiento", "Pack assistance au stationnement", "Pacchetto assistenza al parcheggio", "停车辅助套装"],

  // -- Wheel / tire size variants ---------------------------------------
  ["S2RF", "wheels", "Run-flat tyres", "Notlaufeigenschaften", "Neumáticos run-flat", "Pneus run-flat", "Pneumatici run-flat", "缺气保用轮胎"],
  ["S2H7", "wheels", "Light-alloy wheels Y-spoke", "Leichtmetallräder Y-Speiche", "Llantas de aleación radios en Y", "Jantes en alliage à branches en Y", "Cerchi in lega a razze a Y", "Y 形辐条轻合金轮毂"],

  // -- Pedal sets / sport ------------------------------------------------
  ["S710A", "interior", "M sports pedals", "M Sportpedale", "Pedales M Sport", "Pédalier M Sport", "Pedaliera M Sport", "M 运动踏板"],
  ["S2VS", "chassis", "M Servotronic", "M Servotronic", "M Servotronic", "M Servotronic", "M Servotronic", "M Servotronic"],
];

// ---------------------------------------------------------------------------
// Paint codes
// ---------------------------------------------------------------------------
const PAINT_CODES: PaintTuple[] = [
  // Solids
  ["300", "non-metallic", "#FFFFFF", "Alpine White III", "Alpinweiß III", "Blanco Alpino III", "Blanc Alpin III", "Bianco Alpino III", "阿尔卑斯白 III"],
  ["668", "non-metallic", "#0A0A0A", "Jet Black", "Schwarz", "Negro", "Noir", "Nero", "纯黑色"],
  ["A52", "metallic", "#9DACBA", "Space Grey metallic", "Spacegrau metallic", "Gris Espacial metalizado", "Gris espace métallisé", "Grigio Spazio metallizzato", "太空灰金属漆"],
  ["475", "metallic", "#191B1F", "Black Sapphire metallic", "Saphirschwarz metallic", "Negro Zafiro metalizado", "Noir Saphir métallisé", "Nero Zaffiro metallizzato", "蓝宝石黑金属漆"],
  ["A89", "metallic", "#3F576B", "Imperial Blue Brilliant Effect", "Imperialblau brillanteffekt", "Azul Imperial brillante", "Bleu Impérial brillant", "Blu Imperiale brillante", "皇家蓝亮彩漆"],
  ["A90", "metallic", "#9C2235", "Vermillion Red metallic", "Vermillionrot metallic", "Rojo Bermellón metalizado", "Rouge Vermillon métallisé", "Rosso Vermiglio metallizzato", "朱红色金属漆"],
  ["A96", "metallic", "#E0E2E5", "Mineral White metallic", "Mineralweiß metallic", "Blanco Mineral metalizado", "Blanc Minéral métallisé", "Bianco Minerale metallizzato", "矿石白金属漆"],
  ["B39", "metallic", "#7C8186", "Mineral Grey metallic", "Mineralgrau metallic", "Gris Mineral metalizado", "Gris Minéral métallisé", "Grigio Minerale metallizzato", "矿石灰金属漆"],
  ["B45", "metallic", "#3D424B", "Sophisto Grey metallic", "Sophistograu metallic", "Gris Sophisto metalizado", "Gris Sophisto métallisé", "Grigio Sophisto metallizzato", "雅士灰金属漆"],
  ["C10", "metallic", "#1B2C3D", "Mediterranean Blue metallic", "Mittelmeerblau metallic", "Azul Mediterráneo metalizado", "Bleu Méditerranée métallisé", "Blu Mediterraneo metallizzato", "地中海蓝金属漆"],
  ["C1M", "metallic", "#363B40", "Bluestone metallic", "Bluestone metallic", "Bluestone metalizado", "Bluestone métallisé", "Bluestone metallizzato", "蓝灰石金属漆"],
  ["C2Y", "metallic", "#1F2E37", "Tanzanite Blue II metallic", "Tansanitblau II metallic", "Azul Tanzanita II metalizado", "Bleu Tanzanite II métallisé", "Blu Tanzanite II metallizzato", "坦桑尼蓝 II 金属漆"],
  ["C3D", "metallic", "#445C75", "Phytonic Blue metallic", "Phytonicblau metallic", "Azul Phytonic metalizado", "Bleu Phytonic métallisé", "Blu Phytonic metallizzato", "费托蓝金属漆"],
  ["C4E", "metallic", "#7C9085", "Aventurine Red metallic", "Aventurinrot metallic", "Rojo Aventurin metalizado", "Rouge Aventurine métallisé", "Rosso Aventurine metallizzato", "砂金石红金属漆"],
  ["C57", "metallic", "#3B6FA1", "Estoril Blue II metallic", "Estorilblau II metallic", "Azul Estoril II metalizado", "Bleu Estoril II métallisé", "Blu Estoril II metallizzato", "埃斯特蓝 II 金属漆"],
  ["P0B", "individual", "#262C36", "Frozen Black metallic", "Frozen Black metallic", "Negro Frozen metalizado", "Noir Frozen métallisé", "Nero Frozen metallizzato", "冰冻黑金属漆"],
  ["P7M", "individual", "#5A6E7C", "Frozen Pure Grey metallic", "Frozen Pure Grey metallic", "Gris Puro Frozen metalizado", "Gris Pur Frozen métallisé", "Grigio Puro Frozen metallizzato", "冰冻纯灰金属漆"],
  ["X02", "individual", "#7E2A2D", "BMW Individual Aventurine Red metallic", "BMW Individual Aventurinrot metallic", "BMW Individual Rojo Aventurin metalizado", "BMW Individual Rouge Aventurine métallisé", "BMW Individual Rosso Aventurine metallizzato", "BMW Individual 砂金石红金属漆"],
  ["X1A", "individual", "#1F1F1F", "BMW Individual Ruby Black metallic", "BMW Individual Rubinschwarz metallic", "BMW Individual Negro Rubí metalizado", "BMW Individual Noir Rubis métallisé", "BMW Individual Nero Rubino metallizzato", "BMW Individual 红宝石黑金属漆"],
  ["Z0F", "individual", "#1B202C", "BMW Individual Tanzanite Blue II metallic", "BMW Individual Tansanitblau II metallic", "BMW Individual Azul Tanzanita II metalizado", "BMW Individual Bleu Tanzanite II métallisé", "BMW Individual Blu Tanzanite II metallizzato", "BMW Individual 坦桑尼蓝 II 金属漆"],
  // Common modern G-chassis paints
  ["P7M0", "individual", "#5A6E7C", "Frozen Pure Grey II metallic", "Frozen Pure Grey II metallic", "Gris Puro Frozen II metalizado", "Gris Pur Frozen II métallisé", "Grigio Puro Frozen II metallizzato", "冰冻纯灰 II 金属漆"],
  ["P7Y", "individual", "#404B57", "Frozen Deep Grey metallic", "Frozen Deep Grey metallic", "Gris Profundo Frozen metalizado", "Gris Profond Frozen métallisé", "Grigio Profondo Frozen metallizzato", "冰冻深灰金属漆"],
  ["C4F", "metallic", "#A8AAAD", "Brooklyn Grey metallic", "Brooklyngrau metallic", "Gris Brooklyn metalizado", "Gris Brooklyn métallisé", "Grigio Brooklyn metallizzato", "布鲁克林灰金属漆"],
  ["C36", "metallic", "#1A2335", "Carbon Black metallic", "Carbonschwarz metallic", "Negro Carbón metalizado", "Noir Carbone métallisé", "Nero Carbonio metallizzato", "碳黑金属漆"],
  ["475A", "metallic", "#191B1F", "Black Sapphire metallic", "Saphirschwarz metallic", "Negro Zafiro metalizado", "Noir Saphir métallisé", "Nero Zaffiro metallizzato", "蓝宝石黑金属漆"],
  ["A75", "metallic", "#243036", "Melbourne Red metallic", "Melbourne-Rot metallic", "Rojo Melbourne metalizado", "Rouge Melbourne métallisé", "Rosso Melbourne metallizzato", "墨尔本红金属漆"],
  ["A76", "metallic", "#21343A", "Liquid Blue metallic", "Liquidblau metallic", "Azul Líquido metalizado", "Bleu Liquid métallisé", "Blu Liquid metallizzato", "液态蓝金属漆"],
  ["A83", "metallic", "#7E8389", "Glacier Silver metallic", "Gletschersilber metallic", "Plata Glaciar metalizado", "Argent Glacier métallisé", "Argento Ghiacciaio metallizzato", "冰川银金属漆"],
  ["A91", "metallic", "#2C2D34", "Kalahari Beige metallic", "Kalaharibeige metallic", "Beige Kalahari metalizado", "Beige Kalahari métallisé", "Beige Kalahari metallizzato", "卡拉哈里米金属漆"],
  ["B38", "metallic", "#212B33", "Midnight Blue metallic", "Mitternachtsblau metallic", "Azul Medianoche metalizado", "Bleu Minuit métallisé", "Blu Mezzanotte metallizzato", "午夜蓝金属漆"],
  ["B66", "metallic", "#0F0F11", "Carbon Black II metallic", "Carbonschwarz II metallic", "Negro Carbón II metalizado", "Noir Carbone II métallisé", "Nero Carbonio II metallizzato", "碳黑 II 金属漆"],
  ["C06", "metallic", "#222B33", "Snapper Rocks Blue metallic", "Snapper-Rocks-Blau metallic", "Azul Snapper Rocks metalizado", "Bleu Snapper Rocks métallisé", "Blu Snapper Rocks metallizzato", "斯纳珀岩石蓝金属漆"],
  ["C0R", "metallic", "#2B5468", "Long Beach Blue metallic", "Long-Beach-Blau metallic", "Azul Long Beach metalizado", "Bleu Long Beach métallisé", "Blu Long Beach metallizzato", "长滩蓝金属漆"],
  ["C2X", "metallic", "#3B3631", "Manhattan Green metallic", "Manhattan-Grün metallic", "Verde Manhattan metalizado", "Vert Manhattan métallisé", "Verde Manhattan metallizzato", "曼哈顿绿金属漆"],
  ["C3E", "metallic", "#9A8A78", "Sunset Orange metallic", "Sunset Orange metallic", "Naranja Sunset metalizado", "Orange Coucher de Soleil métallisé", "Arancione Sunset metallizzato", "日落橙金属漆"],
  ["C4P", "metallic", "#3F4A4F", "Dravit Grey metallic", "Dravitgrau metallic", "Gris Dravit metalizado", "Gris Dravit métallisé", "Grigio Dravit metallizzato", "杜威灰金属漆"],
  ["C4W", "metallic", "#445B73", "Portimao Blue metallic", "Portimaoblau metallic", "Azul Portimao metalizado", "Bleu Portimao métallisé", "Blu Portimao metallizzato", "葡萄蓝金属漆"],
  ["C49", "individual", "#7C151B", "BMW Individual Aventurine Red III", "BMW Individual Aventurinrot III", "BMW Individual Rojo Aventurin III", "BMW Individual Rouge Aventurine III", "BMW Individual Rosso Aventurine III", "BMW Individual 砂金石红 III"],
  ["P7Z", "individual", "#3F576B", "BMW Individual Frozen Marina Bay Blue", "BMW Individual Frozen Marina Bay Blau", "BMW Individual Azul Marina Bay Frozen", "BMW Individual Bleu Marina Bay Frozen", "BMW Individual Blu Marina Bay Frozen", "BMW Individual 冰冻滨海湾蓝"],
  ["Z0G", "individual", "#1F2E37", "BMW Individual Tanzanite Blue metallic", "BMW Individual Tansanitblau metallic", "BMW Individual Azul Tanzanita metalizado", "BMW Individual Bleu Tanzanite métallisé", "BMW Individual Blu Tanzanite metallizzato", "BMW Individual 坦桑尼蓝金属漆"],
  ["X12", "individual", "#1B202C", "BMW Individual Azurite Black metallic", "BMW Individual Azuritschwarz metallic", "BMW Individual Negro Azurita metalizado", "BMW Individual Noir Azurite métallisé", "BMW Individual Nero Azurite metallizzato", "BMW Individual 蓝铜矿黑金属漆"],
  ["X14", "individual", "#7C9085", "BMW Individual Frozen Cashmere Silver", "BMW Individual Frozen Cashmere Silber", "BMW Individual Cashmere Silver Frozen", "BMW Individual Argent Cashmere Frozen", "BMW Individual Argento Cashmere Frozen", "BMW Individual 冰冻羊绒银"],
  // Newer G-series additions
  ["C3G", "metallic", "#A48E70", "Bernina Grey Amber Effect", "Berninagrau Bernsteineffekt", "Gris Bernina Ámbar", "Gris Bernina Ambre", "Grigio Bernina Ambra", "贝尔尼纳灰琥珀漆"],
  ["C57A", "metallic", "#3B6FA1", "Estoril Blue II metallic (M Sport)", "Estorilblau II metallic (M Sport)", "Azul Estoril II metalizado (M Sport)", "Bleu Estoril II métallisé (M Sport)", "Blu Estoril II metallizzato (M Sport)", "埃斯特蓝 II 金属漆 (M Sport)"],
  ["C3Z", "metallic", "#7E1818", "Toronto Red metallic", "Toronto-Rot metallic", "Rojo Toronto metalizado", "Rouge Toronto métallisé", "Rosso Toronto metallizzato", "多伦多红金属漆"],
  ["C4D", "metallic", "#0E1A28", "Tanzanite Blue II metallic (BMW Individual)", "Tansanitblau II metallic (BMW Individual)", "Azul Tanzanita II BMW Individual", "Bleu Tanzanite II BMW Individual", "Blu Tanzanite II BMW Individual", "BMW Individual 坦桑尼蓝 II 金属漆"],
  ["C2C", "metallic", "#13202C", "BMW Individual Piemont Red", "BMW Individual Piemontrot", "BMW Individual Rojo Piemonte", "BMW Individual Rouge Piémont", "BMW Individual Rosso Piemonte", "BMW Individual 皮埃蒙特红"],
  ["C4S", "metallic", "#5C6D7C", "Skyscraper Grey metallic", "Skyscrapergrau metallic", "Gris Rascacielos metalizado", "Gris Gratte-ciel métallisé", "Grigio Grattacielo metallizzato", "摩天大楼灰金属漆"],
  ["C4Z", "individual", "#9B7A4A", "BMW Individual Voodoo Blue", "BMW Individual Voodoo Blau", "BMW Individual Azul Voodoo", "BMW Individual Bleu Voodoo", "BMW Individual Blu Voodoo", "BMW Individual 巫毒蓝"],
  ["P75", "individual", "#3F4A4F", "Frozen Dark Silver metallic", "Frozen Dark Silver metallic", "Plata Oscura Frozen metalizado", "Argent Foncé Frozen métallisé", "Argento Scuro Frozen metallizzato", "冰冻深银金属漆"],
  ["P74", "individual", "#A8AAAD", "Frozen Brilliant White metallic", "Frozen Brilliantweiß metallic", "Blanco Brillante Frozen", "Blanc Brillant Frozen métallisé", "Bianco Brillante Frozen", "冰冻亮白金属漆"],
  ["WC0F", "metallic", "#FFFFFF", "M Brooklyn Grey metallic", "M Brooklyngrau metallic", "M Gris Brooklyn metalizado", "M Gris Brooklyn métallisé", "M Grigio Brooklyn metallizzato", "M 布鲁克林灰金属漆"],
  ["WC44", "metallic", "#3F576B", "Marina Bay Blue metallic", "Marina-Bay-Blau metallic", "Azul Marina Bay metalizado", "Bleu Marina Bay métallisé", "Blu Marina Bay metallizzato", "滨海湾蓝金属漆"],
  ["WP58", "metallic", "#73AB44", "São Paulo Yellow", "São Paulo Gelb", "Amarillo São Paulo", "Jaune São Paulo", "Giallo São Paulo", "圣保罗黄"],
  ["WP59", "individual", "#244C75", "Riviera Blue", "Riviera Blau", "Azul Riviera", "Bleu Riviera", "Blu Riviera", "里维埃拉蓝"],
  ["WP4F", "metallic", "#9B5C24", "Java Green metallic", "Java Grün metallic", "Verde Java metalizado", "Vert Java métallisé", "Verde Java metallizzato", "爪哇绿金属漆"],
];

// ---------------------------------------------------------------------------
// Upholstery codes
// ---------------------------------------------------------------------------
const UPHOLSTERY_CODES: UpholTuple[] = [
  // Cloth
  ["FAAT", "cloth", "#1A1A1A", "Cloth Anthracite", "Stoff Anthrazit", "Tela Antracita", "Tissu Anthracite", "Tessuto Antracite", "织物 炭灰"],
  ["FAAW", "cloth", "#222222", "Cloth Anthracite (W variant)", "Stoff Anthrazit (W-Variante)", "Tela Antracita (variante W)", "Tissu Anthracite (variante W)", "Tessuto Antracite (variante W)", "织物 炭灰（W 款）"],
  ["FCSW", "cloth", "#1B1B1B", "Cloth Sport Anthracite", "Stoff Sport Anthrazit", "Tela Sport Antracita", "Tissu Sport Anthracite", "Tessuto Sport Antracite", "Sport 织物 炭灰"],
  ["KAAT", "leatherette", "#1A1A1A", "SensaTec Anthracite", "SensaTec Anthrazit", "SensaTec Antracita", "SensaTec Anthracite", "SensaTec Antracite", "SensaTec 炭灰"],
  ["KCSW", "leatherette", "#1A1A1A", "SensaTec Sport Anthracite", "SensaTec Sport Anthrazit", "SensaTec Sport Antracita", "SensaTec Sport Anthracite", "SensaTec Sport Antracite", "SensaTec Sport 炭灰"],
  ["KHSW", "leatherette", "#3A2618", "SensaTec Mocha", "SensaTec Mokka", "SensaTec Moca", "SensaTec Moka", "SensaTec Moka", "SensaTec 摩卡"],
  // Vernasca leather
  ["LCD9", "leather", "#191919", "Leather Vernasca Black", "Leder Vernasca Schwarz", "Cuero Vernasca Negro", "Cuir Vernasca Noir", "Pelle Vernasca Nero", "Vernasca 真皮 黑色"],
  ["LCDR", "leather", "#5A1F1F", "Leather Vernasca Coral Red", "Leder Vernasca Korallrot", "Cuero Vernasca Rojo Coral", "Cuir Vernasca Rouge Corail", "Pelle Vernasca Rosso Corallo", "Vernasca 真皮 珊瑚红"],
  ["LCFG", "leather", "#A38863", "Leather Vernasca Cognac", "Leder Vernasca Cognac", "Cuero Vernasca Cognac", "Cuir Vernasca Cognac", "Pelle Vernasca Cognac", "Vernasca 真皮 干邑色"],
  ["LCK7", "leather", "#1A1A1A", "Leather Vernasca Anthracite blue stitching", "Leder Vernasca Anthrazit Blau-Steppung", "Cuero Vernasca Antracita pespunte azul", "Cuir Vernasca Anthracite surpiqûres bleues", "Pelle Vernasca Antracite cuciture blu", "Vernasca 真皮 炭灰蓝缝线"],
  ["LCSO", "leather", "#1A1A1A", "Leather Vernasca Sport Black", "Leder Vernasca Sport Schwarz", "Cuero Vernasca Sport Negro", "Cuir Vernasca Sport Noir", "Pelle Vernasca Sport Nero", "Vernasca Sport 真皮 黑色"],
  ["LCSW", "leather", "#1B1B1B", "Leather Vernasca Black with M piping", "Leder Vernasca Schwarz mit M-Paspel", "Cuero Vernasca Negro con perfil M", "Cuir Vernasca Noir avec passepoil M", "Pelle Vernasca Nero con bordino M", "Vernasca 真皮 黑色带 M 滚边"],
  ["LHGT", "leather", "#7A2424", "Leather Tartufo brown", "Leder Tartufo braun", "Cuero Tartufo marrón", "Cuir Tartufo brun", "Pelle Tartufo marrone", "Tartufo 真皮 棕色"],
  ["LHSW", "leather", "#1A1A1A", "Leather Dakota Black", "Leder Dakota Schwarz", "Cuero Dakota Negro", "Cuir Dakota Noir", "Pelle Dakota Nero", "Dakota 真皮 黑色"],
  ["LMCV", "leather", "#A6692E", "Merino leather Tartufo", "Merino-Leder Tartufo", "Cuero Merino Tartufo", "Cuir Merino Tartufo", "Pelle Merino Tartufo", "Merino 真皮 Tartufo"],
  ["LMK1", "leather", "#1A1A1A", "Merino leather Black", "Merino-Leder Schwarz", "Cuero Merino Negro", "Cuir Merino Noir", "Pelle Merino Nero", "Merino 真皮 黑色"],
  ["LMSW", "leather", "#1A1A1A", "Merino leather Black with M piping", "Merino-Leder Schwarz mit M-Paspel", "Cuero Merino Negro con perfil M", "Cuir Merino Noir avec passepoil M", "Pelle Merino Nero con bordino M", "Merino 真皮 黑色带 M 滚边"],
  // Extended Merino — common modern combinations
  ["X3KX", "leather", "#E26B2D", "Full Merino leather Kyalami orange / black", "Vollleder Merino Kyalami orange/schwarz", "Cuero Merino completo, naranja Kyalami / negro", "Cuir Merino intégral orange Kyalami / noir", "Pelle Merino integrale arancione Kyalami / nero", "全 Merino 真皮 Kyalami 橙/黑"],
  ["X3SW", "leather", "#1A1A1A", "Full Merino leather Black", "Vollleder Merino Schwarz", "Cuero Merino completo, negro", "Cuir Merino intégral noir", "Pelle Merino integrale nera", "全 Merino 真皮 黑色"],
  ["X3CW", "leather", "#7C2A2A", "Full Merino leather Sakhir Orange", "Vollleder Merino Sakhir Orange", "Cuero Merino completo, naranja Sakhir", "Cuir Merino intégral orange Sakhir", "Pelle Merino integrale arancione Sakhir", "全 Merino 真皮 Sakhir 橙"],
  ["XBSW", "leather", "#1A1A1A", "BMW Individual full Merino leather Black", "BMW Individual Vollleder Merino Schwarz", "BMW Individual cuero Merino completo, negro", "BMW Individual cuir Merino intégral noir", "BMW Individual pelle Merino integrale nera", "BMW Individual 全 Merino 真皮 黑色"],
  ["XBSO", "leather", "#291710", "BMW Individual full Merino leather Smoke White / Black", "BMW Individual Vollleder Merino Smoke White/Schwarz", "BMW Individual cuero Merino completo, blanco humo / negro", "BMW Individual cuir Merino intégral blanc fumé / noir", "BMW Individual pelle Merino integrale bianco fumé / nero", "BMW Individual 全 Merino 真皮 烟雾白/黑"],
  // Extended Dakota / SensaTec
  ["LCFR", "leather", "#3D2A1A", "Leather Vernasca Mocha", "Leder Vernasca Mokka", "Cuero Vernasca Moca", "Cuir Vernasca Moka", "Pelle Vernasca Moka", "Vernasca 真皮 摩卡"],
  ["LHCN", "leather", "#9A6533", "Leather Dakota Cognac", "Leder Dakota Cognac", "Cuero Dakota Cognac", "Cuir Dakota Cognac", "Pelle Dakota Cognac", "Dakota 真皮 干邑色"],
  ["LHCY", "leather", "#7A2424", "Leather Dakota Coral Red", "Leder Dakota Korallrot", "Cuero Dakota Rojo Coral", "Cuir Dakota Rouge Corail", "Pelle Dakota Rosso Corallo", "Dakota 真皮 珊瑚红"],
  ["LHIA", "leather", "#5C5C5C", "Leather Dakota Ivory White", "Leder Dakota Elfenbeinweiß", "Cuero Dakota Blanco Marfil", "Cuir Dakota Blanc Ivoire", "Pelle Dakota Bianco Avorio", "Dakota 真皮 象牙白"],
  ["LHMG", "leather", "#3F2E26", "Leather Dakota Mocha", "Leder Dakota Mokka", "Cuero Dakota Moca", "Cuir Dakota Moka", "Pelle Dakota Moka", "Dakota 真皮 摩卡"],
  ["LCC4", "leather", "#1A1A1A", "Leather Vernasca Black with red contrast stitching", "Leder Vernasca Schwarz mit roter Kontrastnaht", "Cuero Vernasca Negro con pespunte rojo", "Cuir Vernasca Noir avec surpiqûres rouges", "Pelle Vernasca Nero con cuciture rosse a contrasto", "Vernasca 真皮 黑色红色撞色缝线"],
  ["LCEW", "leather", "#1A1A1A", "Leather Vernasca M Performance", "Leder Vernasca M Performance", "Cuero Vernasca M Performance", "Cuir Vernasca M Performance", "Pelle Vernasca M Performance", "Vernasca 真皮 M Performance"],
  ["LMSO", "leather", "#7C2A2A", "Merino leather Tacora Red / Black", "Merino-Leder Tacora Rot/Schwarz", "Cuero Merino Tacora Rojo / Negro", "Cuir Merino rouge Tacora / noir", "Pelle Merino Rosso Tacora / nero", "Merino 真皮 Tacora 红/黑"],
  ["LMV2", "leather", "#9D4F2A", "Merino leather Fjord Blue / Black", "Merino-Leder Fjordblau/Schwarz", "Cuero Merino Azul Fiordo / Negro", "Cuir Merino bleu Fjord / noir", "Pelle Merino Blu Fiordo / nero", "Merino 真皮 峡湾蓝/黑"],
  ["LMV3", "leather", "#2C2C2C", "Merino leather Silverstone / Black", "Merino-Leder Silverstone/Schwarz", "Cuero Merino Silverstone / Negro", "Cuir Merino Silverstone / noir", "Pelle Merino Silverstone / nero", "Merino 真皮 银石/黑"],
  ["LMV4", "leather", "#A37953", "Merino leather Cognac / Black", "Merino-Leder Cognac/Schwarz", "Cuero Merino Cognac / Negro", "Cuir Merino Cognac / noir", "Pelle Merino Cognac / nero", "Merino 真皮 干邑/黑"],
  // Cloth+Sensatec combinations
  ["KP3W", "cloth", "#1A1A1A", "Cloth/SensaTec combination Anthracite", "Stoff/SensaTec-Kombination Anthrazit", "Combinación tela/SensaTec antracita", "Combinaison tissu/SensaTec anthracite", "Combinazione tessuto/SensaTec antracite", "织物/SensaTec 组合 炭灰"],
  ["FMCH", "cloth", "#1A1A1A", "M cloth/Alcantara Anthracite blue stripes", "M Stoff/Alcantara Anthrazit blaue Streifen", "Tela M/Alcantara antracita rayas azules", "Tissu M/Alcantara anthracite rayures bleues", "Tessuto M/Alcantara antracite con righe blu", "M 织物/Alcantara 炭灰蓝条纹"],
  ["FMSW", "cloth", "#1A1A1A", "M cloth/Alcantara Black with M piping", "M Stoff/Alcantara Schwarz mit M-Paspel", "Tela M/Alcantara negro con perfil M", "Tissu M/Alcantara noir avec passepoil M", "Tessuto M/Alcantara nero con bordino M", "M 织物/Alcantara 黑色带 M 滚边"],
];

// ---------------------------------------------------------------------------
// Emit JSON
// ---------------------------------------------------------------------------
const LOCALES = ["en", "de", "es", "fr", "it", "zh"] as const;

function buildSa(rows: SaTuple[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const [code, category, ...names] of rows) {
    if (seen.has(code)) {
      console.warn(`[build-dictionaries] duplicate SA code skipped: ${code}`);
      continue;
    }
    seen.add(code);
    const localized: Record<string, string> = {};
    LOCALES.forEach((l, i) => (localized[l] = names[i]));
    out.push({ code, category, names: localized });
  }
  return out;
}

function buildPaint(rows: PaintTuple[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const [code, finish, rgb, ...names] of rows) {
    if (seen.has(code)) {
      console.warn(`[build-dictionaries] duplicate paint code skipped: ${code}`);
      continue;
    }
    seen.add(code);
    const localized: Record<string, string> = {};
    LOCALES.forEach((l, i) => (localized[l] = names[i]));
    out.push({ code, finish, rgb, names: localized });
  }
  return out;
}

function buildUphol(rows: UpholTuple[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const [code, material, rgb, ...names] of rows) {
    if (seen.has(code)) {
      console.warn(`[build-dictionaries] duplicate upholstery code skipped: ${code}`);
      continue;
    }
    seen.add(code);
    const localized: Record<string, string> = {};
    LOCALES.forEach((l, i) => (localized[l] = names[i]));
    out.push({ code, material, rgb, names: localized });
  }
  return out;
}

async function main() {
  const dir = path.join(process.cwd(), "data", "dictionaries");
  await mkdir(dir, { recursive: true });
  const sa = buildSa(SA_CODES);
  const paint = buildPaint(PAINT_CODES);
  const uphol = buildUphol(UPHOLSTERY_CODES);
  await writeFile(path.join(dir, "sa_codes.json"), JSON.stringify(sa, null, 2) + "\n");
  await writeFile(path.join(dir, "paint_codes.json"), JSON.stringify(paint, null, 2) + "\n");
  await writeFile(path.join(dir, "upholstery_codes.json"), JSON.stringify(uphol, null, 2) + "\n");
  console.log(`[build-dictionaries] sa=${sa.length} paint=${paint.length} upholstery=${uphol.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
