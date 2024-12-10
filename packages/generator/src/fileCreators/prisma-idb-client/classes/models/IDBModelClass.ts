import { SourceFile } from "ts-morph";
import { Model } from "../../../types";
import { addCountMethod } from "./api/count";
import { addCreateMethod } from "./api/create";
import { addCreateManyMethod } from "./api/createMany";
import { addCreateManyAndReturn } from "./api/createManyAndReturn";
import { addDeleteMethod } from "./api/delete";
import { addDeleteManyMethod } from "./api/deleteMany";
import { addFindFirstMethod } from "./api/findFirst";
import { addFindFirstOrThrow } from "./api/findFirstOrThrow";
import { addFindManyMethod } from "./api/findMany";
import { addFindUniqueMethod } from "./api/findUnique";
import { addFindUniqueOrThrow } from "./api/findUniqueOrThrow";
import { addUpdateMethod } from "./api/update";
import { addUpdateMany } from "./api/updateMany";
import { addUpsertMethod } from "./api/upsert";
import { addApplyOrderByClause } from "./utils/_applyOrderByClause";
import { addApplyRelations } from "./utils/_applyRelations";
import { addApplySelectClause } from "./utils/_applySelectClause";
import { addApplyWhereClause } from "./utils/_applyWhereClause";
import { addFillDefaultsFunction } from "./utils/_fillDefaults";
import { addGetNeededStoresForCreate } from "./utils/_getNeededStoresForCreate";
import { addGetNeededStoresForFind } from "./utils/_getNeededStoresForFind";
import { addGetNeededStoresForWhere } from "./utils/_getNeededStoresForWhere";
import { addPreprocessListFields } from "./utils/_preprocessListFields";
import { addRemoveNestedCreateDataMethod } from "./utils/_removeNestedCreateData";
import { addResolveOrderByKey } from "./utils/_resolveOrderByKey";
import { addResolveSortOrder } from "./utils/_resolveSortOrder";

export function addIDBModelClass(file: SourceFile, model: Model, models: readonly Model[]) {
  const modelClass = file.addClass({
    name: `${model.name}IDBClass`,
    extends: "BaseIDBModelClass",
  });

  addApplyWhereClause(modelClass, model, models);
  addApplySelectClause(modelClass, model);
  addApplyRelations(modelClass, model, models);
  addApplyOrderByClause(modelClass, model);
  addResolveOrderByKey(modelClass, model, models);
  addResolveSortOrder(modelClass, model);
  addFillDefaultsFunction(modelClass, model);
  addGetNeededStoresForWhere(modelClass, model);
  addGetNeededStoresForFind(modelClass, model);
  addGetNeededStoresForCreate(modelClass, model);
  addRemoveNestedCreateDataMethod(modelClass, model);
  addPreprocessListFields(modelClass, model);

  addFindManyMethod(modelClass, model);
  addFindFirstMethod(modelClass, model);
  addFindFirstOrThrow(modelClass, model);
  addFindUniqueMethod(modelClass, model);
  addFindUniqueOrThrow(modelClass, model);
  addCountMethod(modelClass, model);

  addCreateMethod(modelClass, model, models);
  addCreateManyMethod(modelClass, model);
  addCreateManyAndReturn(modelClass, model);

  addDeleteMethod(modelClass, model, models);
  addDeleteManyMethod(modelClass, model, models);

  addUpdateMethod(modelClass, model);
  addUpdateMany(modelClass, model);
  addUpsertMethod(modelClass, model);
}
