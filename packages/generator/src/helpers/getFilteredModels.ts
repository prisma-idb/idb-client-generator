import { Model } from "../fileCreators/types";

export function getProjectedFilteredModels(filteredModels: readonly Model[]) {
  return filteredModels.map((model) => {
    return {
      ...model,
      fields: getFilteredFields(model, filteredModels),
    };
  });
}

function getFilteredFields(model: Model, filteredModels: readonly Model[]) {
  const removedExcludedModelsRelationships = model.fields.filter(
    (field) => !isFieldRelationToUnsyncableModel(field, filteredModels),
  );

  return removedExcludedModelsRelationships;
}

function isFieldRelationToUnsyncableModel(
  field: { kind: string; type: string },
  filteredModels: readonly Model[],
): boolean {
  return field.kind === "object" && !filteredModels.some((m) => m.name === field.type);
}
