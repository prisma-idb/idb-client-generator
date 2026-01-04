/**
 * Determines if a model should be tracked in the outbox based on include/exclude filters
 * Returns true if the model should be tracked
 */
export function shouldTrackModel(modelName: string, include: string[], exclude: string[]): boolean {
  // If include has anything other than "*", check if model is in the list
  if (include.length > 0 && include[0] !== "*") {
    return include.includes(modelName);
  }

  // If exclude is specified, check if model is NOT in the list
  if (exclude.length > 0) {
    return !exclude.includes(modelName);
  }

  // Default: track all models
  return true;
}

/**
 * Converts a model name to a camelCase property name for use in the client
 */
export function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
