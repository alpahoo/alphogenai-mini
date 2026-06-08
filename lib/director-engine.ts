import type { EngineKey } from "@/lib/types";

/** Internal engine used when AI Director is launched while the model selector is Auto. */
export const AI_DIRECTOR_AUTO_ENGINE: EngineKey = "seedance2_fast_byteplus";

export function resolveDirectorEngineKey(selectedEngine: EngineKey | "auto"): EngineKey {
  return selectedEngine === "auto" ? AI_DIRECTOR_AUTO_ENGINE : selectedEngine;
}
