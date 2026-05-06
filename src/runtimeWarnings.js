const VALID_CATEGORIES = new Set([
  "reconcile",
  "artifact",
  "journal",
  "jarvis",
  "mcp",
  "runtime-health",
]);

export function formatErrorMessage(error) {
  if (error == null) return "unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name || "unknown error";
  if (typeof error === "object") {
    if (typeof error.message === "string" && error.message.trim()) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function buildRuntimeWarning(category, message, details = undefined) {
  const safeCategory = VALID_CATEGORIES.has(category) ? category : "runtime-health";
  return {
    category: safeCategory,
    message: formatErrorMessage(message),
    details: details == null ? undefined : formatErrorMessage(details),
  };
}

export function warnRuntime(category, message, details = undefined) {
  const warning = buildRuntimeWarning(category, message, details);
  const suffix = warning.details ? ` ${warning.details}` : "";
  try {
    console.warn(`[${warning.category}] ${warning.message}${suffix}`);
  } catch {
    // Warnings must never throw in runtime paths.
  }
  return warning;
}
