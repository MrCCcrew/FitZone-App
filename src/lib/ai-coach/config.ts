export function isCoachAdvancedFeaturesEnabled() {
  return process.env.AI_COACH_ADVANCED_FEATURES !== "false";
}

export function isCoachSmartModeEnabled() {
  return process.env.AI_COACH_SMART_MODE_ENABLED !== "false";
}

export function isCoachToolsEnabled() {
  return process.env.AI_COACH_TOOLS_ENABLED !== "false";
}

export function isCoachVoiceEnabled() {
  return process.env.AI_COACH_VOICE_ENABLED === "true";
}

export function isCoachSemanticSearchEnabled() {
  return process.env.AI_COACH_KNOWLEDGE_SEMANTIC_SEARCH_ENABLED === "true";
}

export function isCoachDebugEnabled() {
  return process.env.NODE_ENV === "development" && process.env.AI_COACH_DEBUG_ENABLED === "true";
}

export function isCoachObservabilityEnabled() {
  return process.env.AI_COACH_OBSERVABILITY !== "false";
}
