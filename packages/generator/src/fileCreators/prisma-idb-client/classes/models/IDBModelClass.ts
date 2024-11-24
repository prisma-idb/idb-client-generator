import { SourceFile } from "ts-morph";
import { Model } from "../../../types";
import { addCountMethod } from "./api/count";
import { addCreateMethod } from "./api/create";
import { addFindFirstMethod } from "./api/findFirst";
import { addFindManyMethod } from "./api/findMany";
import { addFindUniqueMethod } from "./api/findUnique";
import { addApplyRelations } from "./utils/_applyRelations";
import { addApplySelectClause } from "./utils/_applySelectClause";
import { addFillDefaultsFunction } from "./utils/_fillDefaults";
import { addGetNeededStoresForCreate } from "./utils/_getNeededStoresForCreate";
import { addNestedCreateMethod } from "./utils/_nestedCreate";
import { addPerformNestedCreatesMethod } from "./utils/_performNestedCreates";
import { addRemoveNestedCreateDataMethod } from "./utils/_removeNestedCreateData";
import { addFindFirstOrThrow } from "./api/findFirstOrThrow";
import { addApplyWhereClause } from "./utils/_applyWhereClause";
import { addCreateManyMethod } from "./api/createMany";
import { addFindUniqueOrThrow } from "./api/findUniqueOrThrow";

export function addIDBModelClass(file: SourceFile, model: Model, models: readonly Model[]) {
  const modelClass = file.addClass({
    name: `${model.name}IDBClass`,
    extends: "BaseIDBModelClass",
  });

  addApplyWhereClause(modelClass, model);
  addApplySelectClause(modelClass, model);
  addApplyRelations(modelClass, model, models);
  addFillDefaultsFunction(modelClass, model);
  addGetNeededStoresForCreate(modelClass, model);
  addRemoveNestedCreateDataMethod(modelClass, model);
  addPerformNestedCreatesMethod(modelClass, model, models);
  addNestedCreateMethod(modelClass, model);

  addFindManyMethod(modelClass, model);
  addFindFirstMethod(modelClass, model);
  addFindFirstOrThrow(modelClass, model);
  addFindUniqueMethod(modelClass, model);
  addFindUniqueOrThrow(modelClass, model);
  addCountMethod(modelClass, model);

  addCreateMethod(modelClass, model);
  addCreateManyMethod(modelClass, model);
}
