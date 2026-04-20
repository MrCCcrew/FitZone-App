export function isCoachAdvancedFeaturesEnabled() {
  return process.env.AI_COACH_ADVANCED_FEATURES !== "false";
}

export function isCoachObservabilityEnabled() {
  return process.env.AI_COACH_OBSERVABILITY !== "false";
}
