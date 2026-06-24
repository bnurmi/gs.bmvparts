import { storage } from "./storage";
import type { InsertBmwModel } from "@shared/schema";
import { invalidateBmwModelsIndex } from "./vin-decoder";

export interface LegacyModelEntry {
  chassis: string;
  typeCode: string;
  modelName: string;
  market?: string | null;
  bodyType?: string | null;
  engineDisplacement?: string | null;
  enginePowerKw?: number | null;
  engineCode?: string | null;
}

const CURATED_SOURCE = "https://github.com/bmw-models/curated";

export const LEGACY_BMW_MODELS: LegacyModelEntry[] = [
  { chassis: "E36", typeCode: "CA51", modelName: "316i", bodyType: "Sedan", engineDisplacement: "1.6l", engineCode: "M40", enginePowerKw: 75 },
  { chassis: "E36", typeCode: "CA52", modelName: "316i", bodyType: "Sedan", engineDisplacement: "1.9l", engineCode: "M43", enginePowerKw: 77 },
  { chassis: "E36", typeCode: "CB31", modelName: "318i", bodyType: "Sedan", engineDisplacement: "1.8l", engineCode: "M40", enginePowerKw: 83 },
  { chassis: "E36", typeCode: "CB32", modelName: "318is", bodyType: "Coupe", engineDisplacement: "1.8l", engineCode: "M42", enginePowerKw: 103 },
  { chassis: "E36", typeCode: "CB72", modelName: "325i", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M50", enginePowerKw: 141 },
  { chassis: "E36", typeCode: "CC52", modelName: "320i", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "M50", enginePowerKw: 110 },
  { chassis: "E36", typeCode: "CD32", modelName: "318ti Compact", bodyType: "Compact", engineDisplacement: "1.8l", engineCode: "M42", enginePowerKw: 103 },
  { chassis: "E36", typeCode: "CG52", modelName: "323i", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M52", enginePowerKw: 125 },
  { chassis: "E36", typeCode: "CG82", modelName: "323i Coupe", bodyType: "Coupe", engineDisplacement: "2.5l", engineCode: "M52", enginePowerKw: 125 },
  { chassis: "E36", typeCode: "CH82", modelName: "328i Coupe", bodyType: "Coupe", engineDisplacement: "2.8l", engineCode: "M52", enginePowerKw: 142 },
  { chassis: "E36", typeCode: "CD82", modelName: "325i Coupe", bodyType: "Coupe", engineDisplacement: "2.5l", engineCode: "M50", enginePowerKw: 141 },
  { chassis: "E36", typeCode: "BH71", modelName: "323i Convertible", bodyType: "Convertible", engineDisplacement: "2.5l", engineCode: "M52", enginePowerKw: 125 },
  { chassis: "E36", typeCode: "BH72", modelName: "328i Convertible", bodyType: "Convertible", engineDisplacement: "2.8l", engineCode: "M52", enginePowerKw: 142 },
  { chassis: "E36", typeCode: "AT91", modelName: "M3", market: "USA", bodyType: "Sedan", engineDisplacement: "3.2l", engineCode: "S52", enginePowerKw: 179 },
  { chassis: "E36", typeCode: "AL91", modelName: "M3", market: "Europe", bodyType: "Coupe", engineDisplacement: "3.2l", engineCode: "S50", enginePowerKw: 236 },
  { chassis: "E36", typeCode: "AK51", modelName: "M3 Convertible", bodyType: "Convertible", engineDisplacement: "3.2l", engineCode: "S50", enginePowerKw: 236 },
  { chassis: "E36", typeCode: "CG81", modelName: "320i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.0l", engineCode: "M52", enginePowerKw: 110 },
  { chassis: "E36", typeCode: "CG83", modelName: "323i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.5l", engineCode: "M52", enginePowerKw: 125 },
  { chassis: "E36", typeCode: "CG87", modelName: "328i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.8l", engineCode: "M52", enginePowerKw: 142 },

  { chassis: "E39", typeCode: "DD61", modelName: "528i", bodyType: "Sedan", engineDisplacement: "2.8l", engineCode: "M52", enginePowerKw: 142 },
  { chassis: "E39", typeCode: "DM61", modelName: "528i", bodyType: "Sedan", engineDisplacement: "2.8l", engineCode: "M52TU", enginePowerKw: 142 },
  { chassis: "E39", typeCode: "DT41", modelName: "525i", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E39", typeCode: "DT42", modelName: "525i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E39", typeCode: "DT61", modelName: "530i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E39", typeCode: "DT62", modelName: "530i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E39", typeCode: "DH51", modelName: "540i", bodyType: "Sedan", engineDisplacement: "4.4l", engineCode: "M62", enginePowerKw: 210 },
  { chassis: "E39", typeCode: "DH52", modelName: "540iA", bodyType: "Sedan", engineDisplacement: "4.4l", engineCode: "M62TU", enginePowerKw: 210 },
  { chassis: "E39", typeCode: "DR62", modelName: "540i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "4.4l", engineCode: "M62", enginePowerKw: 210 },
  { chassis: "E39", typeCode: "DE91", modelName: "M5", bodyType: "Sedan", engineDisplacement: "4.9l", engineCode: "S62", enginePowerKw: 294 },
  { chassis: "E39", typeCode: "DE92", modelName: "M5", market: "USA", bodyType: "Sedan", engineDisplacement: "4.9l", engineCode: "S62", enginePowerKw: 294 },
  { chassis: "E39", typeCode: "DD42", modelName: "525d", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M57", enginePowerKw: 120 },
  { chassis: "E39", typeCode: "DD52", modelName: "530d", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M57", enginePowerKw: 142 },

  { chassis: "E46", typeCode: "AL31", modelName: "320i", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "M52TU", enginePowerKw: 110 },
  { chassis: "E46", typeCode: "AL32", modelName: "320i", bodyType: "Sedan", engineDisplacement: "2.2l", engineCode: "M54", enginePowerKw: 125 },
  { chassis: "E46", typeCode: "AL51", modelName: "320i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.2l", engineCode: "M54", enginePowerKw: 125 },
  { chassis: "E46", typeCode: "AM52", modelName: "325i", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E46", typeCode: "AM72", modelName: "325i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E46", typeCode: "AV12", modelName: "325xi", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E46", typeCode: "AV72", modelName: "325xi Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E46", typeCode: "AV52", modelName: "325Ci Coupe", bodyType: "Coupe", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E46", typeCode: "BL52", modelName: "330i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E46", typeCode: "BL72", modelName: "330i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E46", typeCode: "BS52", modelName: "330xi", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E46", typeCode: "BW52", modelName: "330Ci Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E46", typeCode: "BW53", modelName: "330Ci Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E46", typeCode: "AX52", modelName: "318i", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N42", enginePowerKw: 105 },
  { chassis: "E46", typeCode: "AX72", modelName: "318i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.0l", engineCode: "N42", enginePowerKw: 105 },
  { chassis: "E46", typeCode: "AY12", modelName: "316i", bodyType: "Sedan", engineDisplacement: "1.8l", engineCode: "N42", enginePowerKw: 85 },
  { chassis: "E46", typeCode: "AT72", modelName: "318i Compact", bodyType: "Compact", engineDisplacement: "2.0l", engineCode: "N42", enginePowerKw: 105 },
  { chassis: "E46", typeCode: "AT52", modelName: "316ti Compact", bodyType: "Compact", engineDisplacement: "1.8l", engineCode: "N42", enginePowerKw: 85 },
  { chassis: "E46", typeCode: "AT32", modelName: "325ti Compact", bodyType: "Compact", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E46", typeCode: "BL91", modelName: "M3", bodyType: "Coupe", engineDisplacement: "3.2l", engineCode: "S54", enginePowerKw: 252 },
  { chassis: "E46", typeCode: "BL92", modelName: "M3 Convertible", bodyType: "Convertible", engineDisplacement: "3.2l", engineCode: "S54", enginePowerKw: 252 },
  { chassis: "E46", typeCode: "BL93", modelName: "M3 CSL", bodyType: "Coupe", engineDisplacement: "3.2l", engineCode: "S54", enginePowerKw: 265 },
  { chassis: "E46", typeCode: "EU42", modelName: "318d", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "M47", enginePowerKw: 85 },
  { chassis: "E46", typeCode: "EU52", modelName: "320d", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "M47", enginePowerKw: 110 },
  { chassis: "E46", typeCode: "ES72", modelName: "330d", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M57", enginePowerKw: 150 },

  { chassis: "E60", typeCode: "NA51", modelName: "525i", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E60", typeCode: "NC51", modelName: "530i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E60", typeCode: "NE51", modelName: "545i", bodyType: "Sedan", engineDisplacement: "4.4l", engineCode: "N62", enginePowerKw: 245 },
  { chassis: "E60", typeCode: "NB31", modelName: "550i", bodyType: "Sedan", engineDisplacement: "4.8l", engineCode: "N62TU", enginePowerKw: 270 },
  { chassis: "E60", typeCode: "NL71", modelName: "525xi", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E60", typeCode: "NU52", modelName: "530xi", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 190 },
  { chassis: "E60", typeCode: "NB72", modelName: "M5", bodyType: "Sedan", engineDisplacement: "5.0l", engineCode: "S85", enginePowerKw: 373 },
  { chassis: "E60", typeCode: "NU22", modelName: "525d", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "M57TU", enginePowerKw: 130 },
  { chassis: "E60", typeCode: "NU42", modelName: "530d", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M57TU", enginePowerKw: 160 },
  { chassis: "E60", typeCode: "NU62", modelName: "535d", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M57TU2", enginePowerKw: 200 },
  { chassis: "E61", typeCode: "NL12", modelName: "525i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E61", typeCode: "NN52", modelName: "530i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E61", typeCode: "NR52", modelName: "545i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "4.4l", engineCode: "N62", enginePowerKw: 245 },
  { chassis: "E61", typeCode: "NL72", modelName: "525xi Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E61", typeCode: "NU82", modelName: "530xi Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 190 },
  { chassis: "E61", typeCode: "NU52", modelName: "525d Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.5l", engineCode: "M57TU", enginePowerKw: 130 },

  { chassis: "E83", typeCode: "PA53", modelName: "X3 2.5i", bodyType: "SAV", engineDisplacement: "2.5l", engineCode: "M54", enginePowerKw: 141 },
  { chassis: "E83", typeCode: "PA73", modelName: "X3 3.0i", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "M54", enginePowerKw: 170 },
  { chassis: "E83", typeCode: "PA74", modelName: "X3 xDrive30i", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 200 },
  { chassis: "E83", typeCode: "PA72", modelName: "X3 xDrive25i", bodyType: "SAV", engineDisplacement: "2.5l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E83", typeCode: "PC72", modelName: "X3 xDrive28i", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E83", typeCode: "PC92", modelName: "X3 xDrive35i", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },
  { chassis: "E83", typeCode: "PA94", modelName: "X3 2.0d", bodyType: "SAV", engineDisplacement: "2.0l", engineCode: "M47TU2", enginePowerKw: 110 },
  { chassis: "E83", typeCode: "PA95", modelName: "X3 xDrive20d", bodyType: "SAV", engineDisplacement: "2.0l", engineCode: "N47", enginePowerKw: 130 },
  { chassis: "E83", typeCode: "PA93", modelName: "X3 3.0d", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "M57TU2", enginePowerKw: 160 },

  { chassis: "E81", typeCode: "UE11", modelName: "116i", bodyType: "Hatchback (3 Doors)", engineDisplacement: "1.6l", engineCode: "N45", enginePowerKw: 90 },
  { chassis: "E81", typeCode: "UE31", modelName: "118i", bodyType: "Hatchback (3 Doors)", engineDisplacement: "2.0l", engineCode: "N46", enginePowerKw: 105 },
  { chassis: "E81", typeCode: "UE51", modelName: "120i", bodyType: "Hatchback (3 Doors)", engineDisplacement: "2.0l", engineCode: "N46", enginePowerKw: 125 },
  { chassis: "E81", typeCode: "UE13", modelName: "118d", bodyType: "Hatchback (3 Doors)", engineDisplacement: "2.0l", engineCode: "N47", enginePowerKw: 105 },
  { chassis: "E81", typeCode: "UE33", modelName: "120d", bodyType: "Hatchback (3 Doors)", engineDisplacement: "2.0l", engineCode: "N47", enginePowerKw: 130 },
  { chassis: "E87", typeCode: "UD11", modelName: "116i", bodyType: "Hatchback (5 Doors)", engineDisplacement: "1.6l", engineCode: "N45", enginePowerKw: 85 },
  { chassis: "E87", typeCode: "UE51", modelName: "120i", bodyType: "Hatchback (5 Doors)", engineDisplacement: "2.0l", engineCode: "N46", enginePowerKw: 110 },
  { chassis: "E87", typeCode: "UD51", modelName: "118d", bodyType: "Hatchback (5 Doors)", engineDisplacement: "2.0l", engineCode: "M47", enginePowerKw: 90 },
  { chassis: "E87", typeCode: "UD52", modelName: "120d", bodyType: "Hatchback (5 Doors)", engineDisplacement: "2.0l", engineCode: "M47", enginePowerKw: 120 },
  { chassis: "E87", typeCode: "UD91", modelName: "130i", bodyType: "Hatchback (5 Doors)", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 195 },
  { chassis: "E82", typeCode: "UC51", modelName: "125i Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E82", typeCode: "UC71", modelName: "128i Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E82", typeCode: "UC91", modelName: "135i Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },
  { chassis: "E82", typeCode: "UC92", modelName: "1M Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 250 },
  { chassis: "E88", typeCode: "UL51", modelName: "125i Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E88", typeCode: "UL71", modelName: "128i Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E88", typeCode: "UL91", modelName: "135i Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },

  { chassis: "E90", typeCode: "VA31", modelName: "318i", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N46", enginePowerKw: 105 },
  { chassis: "E90", typeCode: "VA51", modelName: "320i", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N46", enginePowerKw: 110 },
  { chassis: "E90", typeCode: "VB11", modelName: "323i", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "N52", enginePowerKw: 130 },
  { chassis: "E90", typeCode: "VB31", modelName: "325i", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E90", typeCode: "VB35", modelName: "325xi", bodyType: "Sedan", engineDisplacement: "2.5l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E90", typeCode: "VR91", modelName: "328i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E90", typeCode: "VB91", modelName: "328i xDrive", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E90", typeCode: "VC11", modelName: "330i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 190 },
  { chassis: "E90", typeCode: "VC31", modelName: "330xi", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 190 },
  { chassis: "E90", typeCode: "PM91", modelName: "335i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },
  { chassis: "E90", typeCode: "PN91", modelName: "335i xDrive", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },
  { chassis: "E90", typeCode: "PG91", modelName: "335d", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M57TU2", enginePowerKw: 210 },
  { chassis: "E90", typeCode: "PH91", modelName: "M3", bodyType: "Sedan", engineDisplacement: "4.0l", engineCode: "S65", enginePowerKw: 309 },
  { chassis: "E90", typeCode: "VG31", modelName: "318d", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N47", enginePowerKw: 105 },
  { chassis: "E90", typeCode: "VG51", modelName: "320d", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N47", enginePowerKw: 130 },
  { chassis: "E90", typeCode: "VS11", modelName: "325d", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M57TU2", enginePowerKw: 145 },
  { chassis: "E90", typeCode: "VS31", modelName: "330d", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "M57TU2", enginePowerKw: 170 },

  { chassis: "E91", typeCode: "VR51", modelName: "320i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.0l", engineCode: "N46", enginePowerKw: 110 },
  { chassis: "E91", typeCode: "VS91", modelName: "328i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E91", typeCode: "VT91", modelName: "328i xDrive Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E91", typeCode: "VR71", modelName: "325i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.5l", engineCode: "N52", enginePowerKw: 160 },
  { chassis: "E91", typeCode: "VT71", modelName: "320d Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.0l", engineCode: "N47", enginePowerKw: 130 },
  { chassis: "E91", typeCode: "VT81", modelName: "330d Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "3.0l", engineCode: "M57TU2", enginePowerKw: 170 },

  { chassis: "E92", typeCode: "WB91", modelName: "328i Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E92", typeCode: "WC91", modelName: "328i xDrive Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E92", typeCode: "KG91", modelName: "335i Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },
  { chassis: "E92", typeCode: "KH91", modelName: "335i xDrive Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },
  { chassis: "E92", typeCode: "WD91", modelName: "335is Coupe", bodyType: "Coupe", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 240 },
  { chassis: "E92", typeCode: "WD92", modelName: "M3 Coupe", bodyType: "Coupe", engineDisplacement: "4.0l", engineCode: "S65", enginePowerKw: 309 },

  { chassis: "E93", typeCode: "WL91", modelName: "328i Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N52", enginePowerKw: 172 },
  { chassis: "E93", typeCode: "WM91", modelName: "335i Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 225 },
  { chassis: "E93", typeCode: "WN91", modelName: "335is Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N54", enginePowerKw: 240 },
  { chassis: "E93", typeCode: "WP91", modelName: "M3 Convertible", bodyType: "Convertible", engineDisplacement: "4.0l", engineCode: "S65", enginePowerKw: 309 },

  { chassis: "F15", typeCode: "GZ41", modelName: "X5 xDrive35i", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F15", typeCode: "GZ81", modelName: "X5 xDrive35d", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N57", enginePowerKw: 190 },
  { chassis: "F15", typeCode: "KR41", modelName: "X5 xDrive50i", bodyType: "SAV", engineDisplacement: "4.4l", engineCode: "N63TU", enginePowerKw: 330 },
  { chassis: "F15", typeCode: "KR61", modelName: "X5 sDrive35i", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F15", typeCode: "KS21", modelName: "X5 xDrive40e", bodyType: "SAV", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F15", typeCode: "KS41", modelName: "X5 xDrive25d", bodyType: "SAV", engineDisplacement: "2.0l", engineCode: "N47", enginePowerKw: 160 },
  { chassis: "F15", typeCode: "KS61", modelName: "X5 xDrive30d", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N57", enginePowerKw: 190 },
  { chassis: "F15", typeCode: "KS81", modelName: "X5 xDrive40d", bodyType: "SAV", engineDisplacement: "3.0l", engineCode: "N57", enginePowerKw: 230 },
  { chassis: "F85", typeCode: "KT01", modelName: "X5 M", bodyType: "SAV", engineDisplacement: "4.4l", engineCode: "S63TU", enginePowerKw: 423 },

  { chassis: "F16", typeCode: "KU21", modelName: "X6 xDrive35i", bodyType: "SAC", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F16", typeCode: "KU41", modelName: "X6 xDrive50i", bodyType: "SAC", engineDisplacement: "4.4l", engineCode: "N63TU", enginePowerKw: 330 },
  { chassis: "F16", typeCode: "KU61", modelName: "X6 sDrive35i", bodyType: "SAC", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F16", typeCode: "KU81", modelName: "X6 xDrive30d", bodyType: "SAC", engineDisplacement: "3.0l", engineCode: "N57", enginePowerKw: 190 },
  { chassis: "F16", typeCode: "KU82", modelName: "X6 xDrive40d", bodyType: "SAC", engineDisplacement: "3.0l", engineCode: "N57", enginePowerKw: 230 },
  { chassis: "F86", typeCode: "KT11", modelName: "X6 M", bodyType: "SAC", engineDisplacement: "4.4l", engineCode: "S63TU", enginePowerKw: 423 },

  { chassis: "F22", typeCode: "1H51", modelName: "218i", bodyType: "Coupe (2 Doors)", engineDisplacement: "1.5l", engineCode: "B38", enginePowerKw: 100 },
  { chassis: "F22", typeCode: "1J11", modelName: "220i", market: "LHD", bodyType: "Coupe (2 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 135 },
  { chassis: "F22", typeCode: "1J12", modelName: "220i", market: "RHD", bodyType: "Coupe (2 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 135 },
  { chassis: "F22", typeCode: "1J31", modelName: "228i", market: "LHD", bodyType: "Coupe (2 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F22", typeCode: "1J32", modelName: "228i", market: "RHD", bodyType: "Coupe (2 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F22", typeCode: "1J51", modelName: "M235i", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 240 },
  { chassis: "F22", typeCode: "1J71", modelName: "M240i", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "B58", enginePowerKw: 250 },
  { chassis: "F87", typeCode: "1H91", modelName: "M2", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 272 },
  { chassis: "F87", typeCode: "1H92", modelName: "M2 Competition", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "S55", enginePowerKw: 302 },

  { chassis: "F23", typeCode: "1K11", modelName: "220i Convertible", bodyType: "Convertible", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 135 },
  { chassis: "F23", typeCode: "1K31", modelName: "228i Convertible", bodyType: "Convertible", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F23", typeCode: "1K51", modelName: "M235i Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 240 },

  { chassis: "F30", typeCode: "3A16", modelName: "320i", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 135 },
  { chassis: "F30", typeCode: "3A56", modelName: "328i", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F30", typeCode: "3D56", modelName: "335i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F30", typeCode: "3D57", modelName: "340i", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "B58", enginePowerKw: 240 },
  { chassis: "F30", typeCode: "3B16", modelName: "320i xDrive", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 135 },
  { chassis: "F30", typeCode: "3B56", modelName: "328i xDrive", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F30", typeCode: "3C56", modelName: "335i xDrive", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F30", typeCode: "3F92", modelName: "320d", bodyType: "Sedan", engineDisplacement: "2.0l", engineCode: "N47/B47", enginePowerKw: 135 },
  { chassis: "F80", typeCode: "3C91", modelName: "M3", bodyType: "Sedan", engineDisplacement: "3.0l", engineCode: "S55", enginePowerKw: 317 },

  { chassis: "F31", typeCode: "8E16", modelName: "320i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 135 },
  { chassis: "F31", typeCode: "8N56", modelName: "328i Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F31", typeCode: "8F16", modelName: "320i xDrive Touring", bodyType: "Touring (5 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 135 },

  { chassis: "F32", typeCode: "3R31", modelName: "428i", bodyType: "Coupe (2 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F32", typeCode: "3R51", modelName: "435i", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F32", typeCode: "3R71", modelName: "440i", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "B58", enginePowerKw: 240 },
  { chassis: "F32", typeCode: "3S31", modelName: "428i xDrive", bodyType: "Coupe (2 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F32", typeCode: "3S51", modelName: "435i xDrive", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F82", typeCode: "3C92", modelName: "M4", bodyType: "Coupe (2 Doors)", engineDisplacement: "3.0l", engineCode: "S55", enginePowerKw: 317 },

  { chassis: "F33", typeCode: "3T31", modelName: "428i Convertible", bodyType: "Convertible", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F33", typeCode: "3T51", modelName: "435i Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F83", typeCode: "3C93", modelName: "M4 Convertible", bodyType: "Convertible", engineDisplacement: "3.0l", engineCode: "S55", enginePowerKw: 317 },

  { chassis: "F36", typeCode: "4D31", modelName: "428i Gran Coupe", bodyType: "Gran Coupe (5 Doors)", engineDisplacement: "2.0l", engineCode: "N20", enginePowerKw: 180 },
  { chassis: "F36", typeCode: "4D51", modelName: "435i Gran Coupe", bodyType: "Gran Coupe (5 Doors)", engineDisplacement: "3.0l", engineCode: "N55", enginePowerKw: 225 },
  { chassis: "F36", typeCode: "4D71", modelName: "440i Gran Coupe", bodyType: "Gran Coupe (5 Doors)", engineDisplacement: "3.0l", engineCode: "B58", enginePowerKw: 240 },
];

export interface LegacyImportResult {
  total: number;
  inserted: number;
  skipped: number;
}

export async function importLegacyBmwModels(opts: { overwriteExisting?: boolean } = {}): Promise<LegacyImportResult> {
  const { overwriteExisting = false } = opts;
  let inserted = 0;
  let skipped = 0;

  for (const m of LEGACY_BMW_MODELS) {
    const existing = await storage.getBmwModelByTypeCode(m.chassis, m.typeCode);
    if (existing && !overwriteExisting) {
      skipped++;
      continue;
    }
    const insert: InsertBmwModel = {
      chassis: m.chassis,
      typeCode: m.typeCode,
      modelName: m.modelName,
      developmentCode: null,
      market: m.market ?? null,
      bodyType: m.bodyType ?? null,
      engineDisplacement: m.engineDisplacement ?? null,
      enginePowerKw: m.enginePowerKw ?? null,
      engineCode: m.engineCode ?? null,
      imageUrl: null,
      sourceUrl: CURATED_SOURCE,
    };
    await storage.upsertBmwModel(insert);
    inserted++;
  }

  if (inserted > 0) {
    invalidateBmwModelsIndex();
  }

  return { total: LEGACY_BMW_MODELS.length, inserted, skipped };
}
