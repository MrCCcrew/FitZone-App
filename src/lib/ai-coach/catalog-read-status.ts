export type TrainerReadState = "ok" | "no_data" | "hidden_only" | "filtered_empty" | "source_error";
export type ScheduleReadState = "ok" | "no_classes" | "no_schedules" | "no_future_schedules" | "no_bookable_schedules" | "source_error";

export function trainerReadState(total: number, visible: number, matched: number): TrainerReadState {
  if (total === 0) return "no_data";
  if (visible === 0) return "hidden_only";
  if (matched === 0) return "filtered_empty";
  return "ok";
}

export function scheduleReadState(classTotal: number, scheduleTotal: number, futureTotal: number, bookableTotal: number): ScheduleReadState {
  if (classTotal === 0) return "no_classes";
  if (scheduleTotal === 0) return "no_schedules";
  if (futureTotal === 0) return "no_future_schedules";
  if (bookableTotal === 0) return "no_bookable_schedules";
  return "ok";
}

export function traceCoachCatalogRead(payload: { trainerTotalCount?: number; trainerVisibleCount?: number; trainerMatchedCount?: number; classTotalCount?: number; scheduleTotalCount?: number; futureScheduleCount?: number; sourceStatus: string }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[AI_COACH_CATALOG_READ]", { environment: process.env.NODE_ENV, ...payload });
}
