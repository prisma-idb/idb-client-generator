import { SourceFile } from "ts-morph";
import { Model } from "../../../types";
import { addCreateMethod } from "./api/create";
import { addFindFirstMethod } from "./api/findFirst";
import { addFindManyMethod } from "./api/findMany";
import { addFindUniqueMethod } from "./api/findUnique";
import { addApplyRelations } from "./utils/applyRelation";
import { addApplySelectClause } from "./utils/applySelectClause";
import { addFillDefaultsFunction } from "./utils/fillDefaults";
import { addGetNeededStoresForCreate } from "./utils/getNeededStoresForCreate";
import { addPerformNestedCreatesMethod } from "./utils/performNestedCreates";

export function addIDBModelClass(file: SourceFile, model: Model, models: readonly Model[]) {
  const modelClass = file.addClass({
    name: `${model.name}IDBClass`,
    extends: "BaseIDBModelClass",
  });

  addApplySelectClause(modelClass, model);
  addApplyRelations(modelClass, model, models);
  addFillDefaultsFunction(modelClass, model);
  addGetNeededStoresForCreate(modelClass, model);
  addPerformNestedCreatesMethod(modelClass, model);

  addFindManyMethod(modelClass, model);
  addFindFirstMethod(modelClass, model);
  addFindUniqueMethod(modelClass, model);

  addCreateMethod(modelClass, model);
}
