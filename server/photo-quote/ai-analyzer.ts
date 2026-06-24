import OpenAI from "openai";
import { loggedChatCompletion } from "../openai-logger";

export interface DetectedPart {
  oem_description: string;
  damage_confidence: "high" | "medium" | "low";
  damage_location: string;
  suggested_category: string;
  status: "required" | "optional" | "review";
  notes?: string;
}

const DAMAGE_ANALYSIS_PROMPT = `You are an expert BMW collision damage assessor with deep knowledge of BMW OEM parts.

Analyse the provided accident photos of the BMW vehicle and identify every damaged or potentially damaged part that would need replacement or repair.

Focus on all visible damage zones:
- Front: bumper bar, bumper cover, reinforcement beam, bonnet/hood, front guards/fenders, headlamps, fog lights, grille, radiator support, cooling system
- Rear: rear bumper, rear reinforcement, boot lid/trunk, tail lights, quarter panels
- Sides: doors, door handles, mirrors, side skirts, window glass, pillars
- Interior: airbags (front, side, curtain), dashboard components, steering column, seat belt pre-tensioners
- Wheels & suspension: wheels/rims, tyres, wheel arch liners
- Structural: crush zones, sills, strut towers

Return a JSON array where each element has these exact fields:
{
  "oem_description": "Exact BMW OEM part description (e.g. Front Bumper Cover M3, Left Front Headlight Assembly, Engine Radiator)",
  "damage_confidence": "high" | "medium" | "low",
  "damage_location": "Short location descriptor (e.g. Front Left, Front Centre, Rear Right)",
  "suggested_category": "One of: Front Clip, Body Panels, Headlamps, Cooling, Airbags & Safety, Wheels, Interior Trim, Structural, Mirrors, Electrical",
  "status": "required" | "optional" | "review",
  "notes": "Optional brief note about the damage or uncertainty"
}

Rules:
- Only include parts that show visible damage OR are extremely likely damaged given the damage pattern
- Use BMW OEM naming conventions
- Set status="required" for parts that are clearly broken/destroyed
- Set status="optional" for parts that may have hidden damage (check on disassembly)  
- Set status="review" for parts where damage is uncertain from photos alone
- Respond with ONLY valid JSON array, no markdown, no explanation

Vehicle context: {{VEHICLE_CONTEXT}}`;

export async function analyzePhotoDamage(
  photos: string[],
  vehicle?: string,
  vin?: string
): Promise<DetectedPart[]> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const client = new OpenAI({ apiKey, baseURL });

  const vehicleContext = [vehicle, vin ? `VIN: ${vin}` : null]
    .filter(Boolean)
    .join(", ") || "BMW (model not specified)";

  const prompt = DAMAGE_ANALYSIS_PROMPT.replace("{{VEHICLE_CONTEXT}}", vehicleContext);

  const imageContent = photos.slice(0, 20).map((photo) => ({
    type: "image_url" as const,
    image_url: {
      url: photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}`,
      detail: "high" as const,
    },
  }));

  const response = await loggedChatCompletion(client, "photo-quote", {
    model: "gpt-5",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageContent,
        ],
      },
    ],
    max_completion_tokens: 4096,
    temperature: 0.2,
  });

  const text = response.choices[0]?.message?.content ?? "[]";

  const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const parts: DetectedPart[] = JSON.parse(cleanText);

  if (!Array.isArray(parts)) {
    throw new Error("AI returned non-array response");
  }

  return parts;
}
