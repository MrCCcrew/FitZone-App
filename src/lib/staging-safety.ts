export function externalSideEffectsAllowed(): boolean {
  if (process.env.APP_ENV !== "staging") {
    return true;
  }

  return process.env.ALLOW_EXTERNAL_SIDE_EFFECTS === "true";
}

export function assertExternalSideEffectsAllowed(service: string): void {
  if (!externalSideEffectsAllowed()) {
    throw new Error(
      `[STAGING_SAFETY] External side effect blocked: ${service}`
    );
  }
}
