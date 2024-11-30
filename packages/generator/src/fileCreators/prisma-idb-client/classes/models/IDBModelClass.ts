import { SourceFile } from "ts-morph";
import { Model } from "../../../types";
import { addCountMethod } from "./api/count";
import { addCreateMethod } from "./api/create";
import { addCreateManyMethod } from "./api/createMany";
import { addCreateManyAndReturn } from "./api/createManyAndReturn";
import { addFindFirstMethod } from "./api/findFirst";
import { addFindFirstOrThrow } from "./api/findFirstOrThrow";
import { addFindManyMethod } from "./api/findMany";
import { addFindUniqueMethod } from "./api/findUnique";
import { addFindUniqueOrThrow } from "./api/findUniqueOrThrow";
import { addUpdateMethod } from "./api/update";
import { addApplyRelations } from "./utils/_applyRelations";
import { addApplySelectClause } from "./utils/_applySelectClause";
import { addApplyWhereClause } from "./utils/_applyWhereClause";
import { addFillDefaultsFunction } from "./utils/_fillDefaults";
import { addGetNeededStoresForCreate } from "./utils/_getNeededStoresForCreate";
import { addGetNeededStoresForFind } from "./utils/_getStoresNeededForFind";
import { addPerformNestedCreatesMethod } from "./utils/_performNestedCreates";
import { addRemoveNestedCreateDataMethod } from "./utils/_removeNestedCreateData";

export function addIDBModelClass(file: SourceFile, model: Model, models: readonly Model[]) {
  const modelClass = file.addClass({
    name: `${model.name}IDBClass`,
    extends: "BaseIDBModelClass",
  });

  addApplyWhereClause(modelClass, model);
  addApplySelectClause(modelClass, model);
  addApplyRelations(modelClass, model, models);
  addFillDefaultsFunction(modelClass, model);
  addGetNeededStoresForFind(modelClass, model);
  addGetNeededStoresForCreate(modelClass, model);
  addRemoveNestedCreateDataMethod(modelClass, model);
  addPerformNestedCreatesMethod(modelClass, model, models);

  addFindManyMethod(modelClass, model);
  addFindFirstMethod(modelClass, model);
  addFindFirstOrThrow(modelClass, model);
  addFindUniqueMethod(modelClass, model);
  addFindUniqueOrThrow(modelClass, model);
  addCountMethod(modelClass, model);

  addCreateMethod(modelClass, model);
  addCreateManyMethod(modelClass, model);
  addCreateManyAndReturn(modelClass, model);

  addUpdateMethod(modelClass, model);
}
