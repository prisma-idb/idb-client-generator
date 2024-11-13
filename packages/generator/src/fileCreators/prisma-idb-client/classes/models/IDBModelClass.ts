import { SourceFile } from "ts-morph";
import { Model } from "../../../types";
import { addApplyRelations } from "./utils/applyRelation";
import { addApplySelectClause } from "./utils/applySelectClause";
import { addFindManyMethod } from "./api/findMany";
import { addFindFirstMethod } from "./api/findFirst";

export function addIDBModelClass(file: SourceFile, model: Model, models: readonly Model[]) {
  const modelClass = file.addClass({
    name: `${model.name}IDBClass`,
    extends: "BaseIDBModelClass",
  });

  addApplySelectClause(modelClass, model);
  addApplyRelations(modelClass, model, models);

  addFindManyMethod(modelClass, model);
  addFindFirstMethod(modelClass, model);
}
