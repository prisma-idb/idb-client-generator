import { CodeBlockWriter } from "ts-morph";
import { Model } from "../../../types";
import { addAggregateMethod } from "./api/aggregate";
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
import { addGetNeededStoresForNestedDelete } from "./utils/_getNeededStoresForNestedDelete";
import { addGetNeededStoresForUpdate } from "./utils/_getNeededStoresForUpdate";
import { addGetNeededStoresForWhere } from "./utils/_getNeededStoresForWhere";
import { addPreprocessListFields } from "./utils/_preprocessListFields";
import { addRemoveNestedCreateDataMethod } from "./utils/_removeNestedCreateData";
import { addResolveOrderByKey } from "./utils/_resolveOrderByKey";
import { addResolveSortOrder } from "./utils/_resolveSortOrder";

export function addIDBModelClass(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer.writeLine(`class ${model.name}IDBClass extends BaseIDBModelClass<"${model.name}">`).block(() => {
    addApplyWhereClause(writer, model, models);
    addApplySelectClause(writer, model);
    addApplyRelations(writer, model, models);
    addApplyOrderByClause(writer, model);
    addResolveOrderByKey(writer, model, models);
    addResolveSortOrder(writer, model);
    addFillDefaultsFunction(writer, model);
    addGetNeededStoresForWhere(writer, model);
    addGetNeededStoresForFind(writer, model);
    addGetNeededStoresForCreate(writer, model);
    addGetNeededStoresForUpdate(writer, model, models);
    addGetNeededStoresForNestedDelete(writer, model, models);
    addRemoveNestedCreateDataMethod(writer, model);
    addPreprocessListFields(writer, model);

    addFindManyMethod(writer, model);
    addFindFirstMethod(writer, model);
    addFindFirstOrThrow(writer, model);
    addFindUniqueMethod(writer, model);
    addFindUniqueOrThrow(writer, model);
    addCountMethod(writer, model);

    addCreateMethod(writer, model, models);
    addCreateManyMethod(writer, model);
    addCreateManyAndReturn(writer, model);

    addDeleteMethod(writer, model, models);
    addDeleteManyMethod(writer, model);

    addUpdateMethod(writer, model, models);
    addUpdateMany(writer, model);
    addUpsertMethod(writer, model);

    addAggregateMethod(writer, model);
  });
}
