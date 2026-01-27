import CodeBlockWriter from "code-block-writer";

export function addVersionMetaIDBClass(writer: CodeBlockWriter, changeMetaModelName: string = "VersionMeta") {
  writer
    .writeLine(`class ${changeMetaModelName}IDBClass extends BaseIDBModelClass<"${changeMetaModelName}">`)
    .block(() => {
      addConstructor(writer, changeMetaModelName);
      addGetMethod(writer, changeMetaModelName);
      addPutMethod(writer, changeMetaModelName);
      addMarkLocalPendingMethod(writer, changeMetaModelName);
      addMarkPushedMethod(writer, changeMetaModelName);
      addMarkPulledMethod(writer, changeMetaModelName);
      addDeleteMethod(writer, changeMetaModelName);
      addClearAllMethod(writer, changeMetaModelName);
    });
}

function addConstructor(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(`constructor(client: PrismaIDBClient, keyPath: string[])`)
    .block(() => {
      writer.writeLine(`super(client, keyPath, "${changeMetaModelName}");`);
    })
    .blankLine();
}

function addGetMethod(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(
      `async get(model: string, key: IDBValidKey, tx?: IDBUtils.TransactionType): Promise<ChangeMetaRecord | undefined>`
    )
    .block(() => {
      writer
        .writeLine(`tx = tx ?? this.client._db.transaction(["${changeMetaModelName}"], "readonly");`)
        .writeLine(`const store = tx.objectStore("${changeMetaModelName}");`)
        .blankLine()
        .writeLine(`const result = await store.get([model, key]);`)
        .blankLine()
        .writeLine(`return result as ChangeMetaRecord | undefined;`);
    })
    .blankLine();
}

function addPutMethod(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(`async put(meta: ChangeMetaRecord, options?: { tx?: IDBUtils.ReadwriteTransactionType }): Promise<void>`)
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`const tx = (txOption ?? this.client._db.transaction(["${changeMetaModelName}"], "readwrite"));`)
        .writeLine(`const store = tx.objectStore("${changeMetaModelName}");`)
        .blankLine()
        .writeLine(`const existingMeta = await store.get([meta.model, meta.key]);`)
        .blankLine()
        .writeLine(`const record: ChangeMetaRecord = {`)
        .writeLine(`model: meta.model,`)
        .writeLine(`key: meta.key,`)
        .writeLine(`lastAppliedChangeId: meta.lastAppliedChangeId ?? existingMeta?.lastAppliedChangeId ?? null,`)
        .writeLine(`localChangePending: meta.localChangePending ?? (existingMeta?.localChangePending ?? false),`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`await store.put(record);`)
        .writeLine(`if (!txOption) await tx.done;`);
    })
    .blankLine();
}

function addMarkLocalPendingMethod(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(
      `async markLocalPending(model: string, key: IDBValidKey, options?: { tx?: IDBUtils.ReadwriteTransactionType }): Promise<void>`
    )
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`const tx = (txOption ?? this.client._db.transaction(["${changeMetaModelName}"], "readwrite"));`)
        .writeLine(`const store = tx.objectStore("${changeMetaModelName}");`)
        .blankLine()
        .writeLine(`const existingMeta = await store.get([model, key]);`)
        .blankLine()
        .writeLine(`const record: ChangeMetaRecord = {`)
        .writeLine(`model,`)
        .writeLine(`key,`)
        .writeLine(`lastAppliedChangeId: existingMeta?.lastAppliedChangeId ?? null,`)
        .writeLine(`localChangePending: true,`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`await store.put(record);`)
        .writeLine(`if (!txOption) await tx.done;`);
    })
    .blankLine();
}

function addMarkPushedMethod(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(
      `async markPushed(model: string, key: IDBValidKey, options?: { tx?: IDBUtils.ReadwriteTransactionType }): Promise<void>`
    )
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`const tx = (txOption ?? this.client._db.transaction(["${changeMetaModelName}"], "readwrite"));`)
        .writeLine(`const store = tx.objectStore("${changeMetaModelName}");`)
        .blankLine()
        .writeLine(`const existingMeta = await store.get([model, key]);`)
        .writeLine(`if (!existingMeta) throw new Error("No existing VersionMeta found for the given model and key");`)
        .blankLine()
        .writeLine(`const record: ChangeMetaRecord = {`)
        .writeLine(`model,`)
        .writeLine(`key,`)
        .writeLine(`lastAppliedChangeId: existingMeta.lastAppliedChangeId,`)
        .writeLine(`localChangePending: false,`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`await store.put(record);`)
        .writeLine(`if (!txOption) await tx.done;`);
    })
    .blankLine();
}

function addMarkPulledMethod(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(
      `async markPulled(model: string, key: IDBValidKey, lastAppliedChangelogId: string, options?: { tx?: IDBUtils.ReadwriteTransactionType }): Promise<void>`
    )
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`const tx = (txOption ?? this.client._db.transaction(["${changeMetaModelName}"], "readwrite"));`)
        .writeLine(`const store = tx.objectStore("${changeMetaModelName}");`)
        .blankLine()
        .writeLine(`const record: ChangeMetaRecord = {`)
        .writeLine(`model,`)
        .writeLine(`key,`)
        .writeLine(`lastAppliedChangeId: lastAppliedChangelogId,`)
        .writeLine(`localChangePending: false,`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`await store.put(record);`)
        .writeLine(`if (!txOption) await tx.done;`);
    })
    .blankLine();
}

function addDeleteMethod(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(`async delete(model: string, key: IDBValidKey): Promise<void>`)
    .block(() => {
      writer
        .writeLine(`const tx = this.client._db.transaction("${changeMetaModelName}", "readwrite");`)
        .writeLine(`const store = tx.objectStore("${changeMetaModelName}");`)
        .blankLine()
        .writeLine(`await store.delete([model, key]);`)
        .writeLine(`await tx.done;`);
    })
    .blankLine();
}

function addClearAllMethod(writer: CodeBlockWriter, changeMetaModelName: string) {
  writer
    .writeLine(`async clearAll(): Promise<number>`)
    .block(() => {
      writer
        .writeLine(`const tx = this.client._db.transaction("${changeMetaModelName}", "readwrite");`)
        .writeLine(`const store = tx.objectStore("${changeMetaModelName}");`)
        .blankLine()
        .writeLine(`const allRecords = await store.getAll();`)
        .writeLine(`const count = allRecords.length;`)
        .blankLine()
        .writeLine(`await store.clear();`)
        .writeLine(`await tx.done;`)
        .blankLine()
        .writeLine(`return count;`);
    })
    .blankLine();
}
