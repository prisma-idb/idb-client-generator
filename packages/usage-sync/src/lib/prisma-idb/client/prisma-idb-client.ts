/* eslint-disable @typescript-eslint/no-unused-vars */
import { openDB } from 'idb';
import type { IDBPDatabase, StoreNames, IDBPTransaction } from 'idb';
import type { Prisma } from '../../generated/prisma/client';
import * as IDBUtils from './idb-utils';
import type {
	OutboxEventRecord,
	PrismaIDBSchema,
	AppliedResult,
	SyncWorkerOptions,
	SyncWorker
} from './idb-interface';
import { validators, keyPathValidators } from '../validators';
import { v4 as uuidv4 } from 'uuid';
const IDB_VERSION = 1;
export class PrismaIDBClient {
	private static instance: PrismaIDBClient;
	_db!: IDBPDatabase<PrismaIDBSchema>;
	private outboxEnabled: boolean = true;
	private includedModels: Set<string>;

	private constructor() {
		this.includedModels = new Set(['User', 'Todo']);
	}
	user!: UserIDBClass;
	todo!: TodoIDBClass;
	$outbox!: OutboxEventIDBClass;
	public static async createClient(): Promise<PrismaIDBClient> {
		if (!PrismaIDBClient.instance) {
			const client = new PrismaIDBClient();
			await client.initialize();
			PrismaIDBClient.instance = client;
		}
		return PrismaIDBClient.instance;
	}
	public async resetDatabase() {
		this._db.close();
		window.indexedDB.deleteDatabase('prisma-idb');
		await PrismaIDBClient.instance.initialize();
	}
	shouldTrackModel(modelName: string): boolean {
		return this.outboxEnabled && this.includedModels.has(modelName);
	}
	createSyncWorker(options: {
		syncHandler: (events: OutboxEventRecord[]) => Promise<AppliedResult[]>;
		batchSize?: number;
		intervalMs?: number;
		maxRetries?: number;
	}): SyncWorker {
		const { syncHandler, batchSize = 20, intervalMs = 8000, maxRetries = 5 } = options;

		let intervalId: ReturnType<typeof setInterval | typeof setTimeout> | null = null;
		let isRunning = false;
		let isProcessing = false;

		const processBatch = async (): Promise<void> => {
			if (!isRunning || isProcessing) return;

			isProcessing = true;
			try {
				const batch = await this.$outbox.getNextBatch({ limit: batchSize });

				if (batch.length === 0) return;

				const toSync = batch.filter((event: OutboxEventRecord) => event.tries < maxRetries);
				const abandoned = batch.filter((event: OutboxEventRecord) => event.tries >= maxRetries);

				for (const event of abandoned) {
					await this.$outbox.markFailed(event.id, `Abandoned after ${maxRetries} retries`);
				}

				if (toSync.length === 0) return;

				let results: AppliedResult[] = [];
				try {
					results = await syncHandler(toSync);
				} catch (err) {
					for (const event of toSync) {
						const error = err instanceof Error ? err.message : String(err);
						await this.$outbox.markFailed(event.id, error);
					}
					return;
				}

				const successIds: string[] = [];
				for (const result of results) {
					if (result.error) {
						await this.$outbox.markFailed(result.id, result.error);
					} else {
						successIds.push(result.id);

						if (result.mergedRecord && result.entityKeyPath) {
							const originalEvent = toSync.find((e: OutboxEventRecord) => e.id === result.id);
							if (originalEvent) {
								try {
									switch (originalEvent.entityType) {
										case 'User': {
											{
												const recordValidation = validators.User.safeParse(result.mergedRecord);
												if (!recordValidation.success) {
													throw new Error(
														`Record validation failed: ${recordValidation.error.message}`
													);
												}
												const keyPathValidation = keyPathValidators.User.safeParse(
													result.entityKeyPath
												);
												if (!keyPathValidation.success) {
													throw new Error(
														`KeyPath validation failed: ${keyPathValidation.error.message}`
													);
												}
												await this.user.upsert(
													{
														where: { id: keyPathValidation.data[0] },
														update: recordValidation.data,
														create: recordValidation.data
													},
													{ silent: true, addToOutbox: false }
												);
												break;
											}
										}
										case 'Todo': {
											{
												const recordValidation = validators.Todo.safeParse(result.mergedRecord);
												if (!recordValidation.success) {
													throw new Error(
														`Record validation failed: ${recordValidation.error.message}`
													);
												}
												const keyPathValidation = keyPathValidators.Todo.safeParse(
													result.entityKeyPath
												);
												if (!keyPathValidation.success) {
													throw new Error(
														`KeyPath validation failed: ${keyPathValidation.error.message}`
													);
												}
												await this.todo.upsert(
													{
														where: { id: keyPathValidation.data[0] },
														update: recordValidation.data,
														create: recordValidation.data
													},
													{ silent: true, addToOutbox: false }
												);
												break;
											}
										}
										default:
											throw new Error(`No upsert handler for ${originalEvent.entityType}`);
									}
								} catch (upsertErr) {
									console.warn(`Failed to upsert merged record for event ${result.id}:`, upsertErr);
								}
							}
						}
					}
				}

				if (successIds.length > 0) {
					await this.$outbox.markSynced(successIds, { syncedAt: new Date() });
				}
			} catch (err) {
				console.error('Sync worker error:', err);
			} finally {
				isProcessing = false;
			}
		};

		const syncLoop = async (): Promise<void> => {
			await processBatch().catch((err) => {
				console.error('Unhandled error in sync loop:', err);
			});
			if (isRunning) {
				intervalId = setTimeout(syncLoop, intervalMs);
			}
		};

		return {
			start(): void {
				if (isRunning) return;
				isRunning = true;
				syncLoop().catch((err) => {
					console.error('Unhandled error starting sync loop:', err);
				});
			},

			stop(): void {
				isRunning = false;
				if (intervalId !== null) {
					clearTimeout(intervalId);
					intervalId = null;
				}
			}
		};
	}
	private async initialize() {
		this._db = await openDB<PrismaIDBSchema>('prisma-idb', IDB_VERSION, {
			upgrade(db) {
				db.createObjectStore('User', { keyPath: ['id'] });
				db.createObjectStore('Todo', { keyPath: ['id'] });
				db.createObjectStore('OutboxEvent', { keyPath: ['id'] });
			}
		});
		this.user = new UserIDBClass(this, ['id']);
		this.todo = new TodoIDBClass(this, ['id']);
		this.$outbox = new OutboxEventIDBClass(this, ['id']);
	}
}
class BaseIDBModelClass<T extends keyof PrismaIDBSchema> {
	protected client: PrismaIDBClient;
	protected keyPath: string[];
	protected modelName: string;
	private eventEmitter: EventTarget;

	constructor(client: PrismaIDBClient, keyPath: string[], modelName: string) {
		this.client = client;
		this.keyPath = keyPath;
		this.modelName = modelName;
		this.eventEmitter = new EventTarget();
	}
	subscribe(
		event: 'create' | 'update' | 'delete' | ('create' | 'update' | 'delete')[],
		callback: (
			e: CustomEventInit<{
				keyPath: PrismaIDBSchema[T]['key'];
				oldKeyPath?: PrismaIDBSchema[T]['key'];
			}>
		) => void
	) {
		if (Array.isArray(event)) {
			event.forEach((event) => this.eventEmitter.addEventListener(event, callback));
		} else {
			this.eventEmitter.addEventListener(event, callback);
		}
	}
	unsubscribe(
		event: 'create' | 'update' | 'delete' | ('create' | 'update' | 'delete')[],
		callback: (
			e: CustomEventInit<{
				keyPath: PrismaIDBSchema[T]['key'];
				oldKeyPath?: PrismaIDBSchema[T]['key'];
			}>
		) => void
	) {
		if (Array.isArray(event)) {
			event.forEach((event) => this.eventEmitter.removeEventListener(event, callback));
			return;
		}
		this.eventEmitter.removeEventListener(event, callback);
	}
	protected async emit(
		event: 'create' | 'update' | 'delete',
		keyPath: PrismaIDBSchema[T]['key'],
		oldKeyPath?: PrismaIDBSchema[T]['key'],
		record?: unknown,
		silent?: boolean,
		addToOutbox?: boolean
	) {
		const shouldEmit = !silent;

		if (shouldEmit) {
			if (event === 'update') {
				this.eventEmitter.dispatchEvent(
					new CustomEvent(event, { detail: { keyPath, oldKeyPath } })
				);
			} else {
				this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath } }));
			}
		}

		if (addToOutbox !== false && this.client.shouldTrackModel(this.modelName)) {
			await this.client.$outbox.create({
				data: {
					entityType: this.modelName,
					entityKeyPath: keyPath as Array<string | number>,
					operation: event,
					payload: record ?? keyPath
				}
			});
		}
	}
}
class UserIDBClass extends BaseIDBModelClass<'User'> {
	constructor(client: PrismaIDBClient, keyPath: string[]) {
		super(client, keyPath, 'User');
	}

	private async _applyWhereClause<
		W extends Prisma.Args<Prisma.UserDelegate, 'findFirstOrThrow'>['where'],
		R extends Prisma.Result<Prisma.UserDelegate, object, 'findFirstOrThrow'>
	>(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
		if (!whereClause) return records;
		records = await IDBUtils.applyLogicalFilters<Prisma.UserDelegate, R, W>(
			records,
			whereClause,
			tx,
			this.keyPath,
			this._applyWhereClause.bind(this)
		);
		return (
			await Promise.all(
				records.map(async (record) => {
					const stringFields = ['id', 'name'] as const;
					for (const field of stringFields) {
						if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
					}
					if (whereClause.todos) {
						if (whereClause.todos.every) {
							const violatingRecord = await this.client.todo.findFirst(
								{
									where: { NOT: { ...whereClause.todos.every }, userId: record.id }
								},
								{ tx }
							);
							if (violatingRecord !== null) return null;
						}
						if (whereClause.todos.some) {
							const relatedRecords = await this.client.todo.findMany(
								{
									where: { ...whereClause.todos.some, userId: record.id }
								},
								{ tx }
							);
							if (relatedRecords.length === 0) return null;
						}
						if (whereClause.todos.none) {
							const violatingRecord = await this.client.todo.findFirst(
								{
									where: { ...whereClause.todos.none, userId: record.id }
								},
								{ tx }
							);
							if (violatingRecord !== null) return null;
						}
					}
					return record;
				})
			)
		).filter((result) => result !== null);
	}
	private _applySelectClause<S extends Prisma.Args<Prisma.UserDelegate, 'findMany'>['select']>(
		records: Prisma.Result<Prisma.UserDelegate, object, 'findFirstOrThrow'>[],
		selectClause: S
	): Prisma.Result<Prisma.UserDelegate, { select: S }, 'findFirstOrThrow'>[] {
		if (!selectClause) {
			return records as Prisma.Result<Prisma.UserDelegate, { select: S }, 'findFirstOrThrow'>[];
		}
		return records.map((record) => {
			const partialRecord: Partial<typeof record> = record;
			for (const untypedKey of ['id', 'name', 'todos']) {
				const key = untypedKey as keyof typeof record & keyof S;
				if (!selectClause[key]) delete partialRecord[key];
			}
			return partialRecord;
		}) as Prisma.Result<Prisma.UserDelegate, { select: S }, 'findFirstOrThrow'>[];
	}
	private async _applyRelations<Q extends Prisma.Args<Prisma.UserDelegate, 'findMany'>>(
		records: Prisma.Result<Prisma.UserDelegate, object, 'findFirstOrThrow'>[],
		tx: IDBUtils.TransactionType,
		query?: Q
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'findFirstOrThrow'>[]> {
		if (!query) return records as Prisma.Result<Prisma.UserDelegate, Q, 'findFirstOrThrow'>[];
		const recordsWithRelations = records.map(async (record) => {
			const unsafeRecord = record as Record<string, unknown>;
			const attach_todos = query.select?.todos || query.include?.todos;
			if (attach_todos) {
				unsafeRecord['todos'] = await this.client.todo.findMany(
					{
						...(attach_todos === true ? {} : attach_todos),
						where: { userId: record.id! }
					},
					{ tx }
				);
			}
			return unsafeRecord;
		});
		return (await Promise.all(recordsWithRelations)) as Prisma.Result<
			Prisma.UserDelegate,
			Q,
			'findFirstOrThrow'
		>[];
	}
	async _applyOrderByClause<
		O extends Prisma.Args<Prisma.UserDelegate, 'findMany'>['orderBy'],
		R extends Prisma.Result<Prisma.UserDelegate, object, 'findFirstOrThrow'>
	>(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
		if (orderByClause === undefined) return;
		const orderByClauses = IDBUtils.convertToArray(orderByClause);
		const indexedKeys = await Promise.all(
			records.map(async (record) => {
				const keys = await Promise.all(
					orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx))
				);
				return { keys, record };
			})
		);
		indexedKeys.sort((a, b) => {
			for (let i = 0; i < orderByClauses.length; i++) {
				const clause = orderByClauses[i];
				const comparison = IDBUtils.genericComparator(
					a.keys[i],
					b.keys[i],
					this._resolveSortOrder(clause)
				);
				if (comparison !== 0) return comparison;
			}
			return 0;
		});
		for (let i = 0; i < records.length; i++) {
			records[i] = indexedKeys[i].record;
		}
	}
	async _resolveOrderByKey(
		record: Prisma.Result<Prisma.UserDelegate, object, 'findFirstOrThrow'>,
		orderByInput: Prisma.UserOrderByWithRelationInput,
		tx: IDBUtils.TransactionType
	): Promise<unknown> {
		const scalarFields = ['id', 'name'] as const;
		for (const field of scalarFields) if (orderByInput[field]) return record[field];
		if (orderByInput.todos) {
			return await this.client.todo.count({ where: { userId: record.id } }, { tx });
		}
	}
	_resolveSortOrder(
		orderByInput: Prisma.UserOrderByWithRelationInput
	): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: 'first' | 'last' } {
		const scalarFields = ['id', 'name'] as const;
		for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
		if (orderByInput.todos?._count) {
			return orderByInput.todos._count;
		}
		throw new Error('No field in orderBy clause');
	}
	private async _fillDefaults<D extends Prisma.Args<Prisma.UserDelegate, 'create'>['data']>(
		data: D,
		tx?: IDBUtils.ReadwriteTransactionType
	): Promise<D> {
		if (data === undefined) data = {} as NonNullable<D>;
		if (data.id === undefined) {
			data.id = uuidv4();
		}
		return data;
	}
	_getNeededStoresForWhere<W extends Prisma.Args<Prisma.UserDelegate, 'findMany'>['where']>(
		whereClause: W,
		neededStores: Set<StoreNames<PrismaIDBSchema>>
	) {
		if (whereClause === undefined) return;
		for (const param of IDBUtils.LogicalParams) {
			if (whereClause[param]) {
				for (const clause of IDBUtils.convertToArray(whereClause[param])) {
					this._getNeededStoresForWhere(clause, neededStores);
				}
			}
		}
		if (whereClause.todos) {
			neededStores.add('Todo');
			this.client.todo._getNeededStoresForWhere(whereClause.todos.every, neededStores);
			this.client.todo._getNeededStoresForWhere(whereClause.todos.some, neededStores);
			this.client.todo._getNeededStoresForWhere(whereClause.todos.none, neededStores);
		}
	}
	_getNeededStoresForFind<Q extends Prisma.Args<Prisma.UserDelegate, 'findMany'>>(
		query?: Q
	): Set<StoreNames<PrismaIDBSchema>> {
		const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
		neededStores.add('User');
		this._getNeededStoresForWhere(query?.where, neededStores);
		if (query?.orderBy) {
			const orderBy = IDBUtils.convertToArray(query.orderBy);
			const orderBy_todos = orderBy.find((clause) => clause.todos);
			if (orderBy_todos) {
				neededStores.add('Todo');
			}
		}
		if (query?.select?.todos || query?.include?.todos) {
			neededStores.add('Todo');
			if (typeof query.select?.todos === 'object') {
				this.client.todo
					._getNeededStoresForFind(query.select.todos)
					.forEach((storeName) => neededStores.add(storeName));
			}
			if (typeof query.include?.todos === 'object') {
				this.client.todo
					._getNeededStoresForFind(query.include.todos)
					.forEach((storeName) => neededStores.add(storeName));
			}
		}
		return neededStores;
	}
	_getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.UserDelegate, 'create'>['data']>>(
		data: D
	): Set<StoreNames<PrismaIDBSchema>> {
		const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
		neededStores.add('User');
		if (data?.todos) {
			neededStores.add('Todo');
			if (data.todos.create) {
				const createData = Array.isArray(data.todos.create)
					? data.todos.create
					: [data.todos.create];
				createData.forEach((record) =>
					this.client.todo
						._getNeededStoresForCreate(record)
						.forEach((storeName) => neededStores.add(storeName))
				);
			}
			if (data.todos.connectOrCreate) {
				IDBUtils.convertToArray(data.todos.connectOrCreate).forEach((record) =>
					this.client.todo
						._getNeededStoresForCreate(record.create)
						.forEach((storeName) => neededStores.add(storeName))
				);
			}
			if (data.todos.createMany) {
				IDBUtils.convertToArray(data.todos.createMany.data).forEach((record) =>
					this.client.todo
						._getNeededStoresForCreate(record)
						.forEach((storeName) => neededStores.add(storeName))
				);
			}
		}
		return neededStores;
	}
	_getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.UserDelegate, 'update'>>(
		query: Partial<Q>
	): Set<StoreNames<PrismaIDBSchema>> {
		const neededStores = this._getNeededStoresForFind(query).union(
			this._getNeededStoresForCreate(
				query.data as Prisma.Args<Prisma.UserDelegate, 'create'>['data']
			)
		);
		if (query.data?.todos?.connect) {
			neededStores.add('Todo');
			IDBUtils.convertToArray(query.data.todos.connect).forEach((connect) => {
				this.client.todo._getNeededStoresForWhere(connect, neededStores);
			});
		}
		if (query.data?.todos?.set) {
			neededStores.add('Todo');
			IDBUtils.convertToArray(query.data.todos.set).forEach((setWhere) => {
				this.client.todo._getNeededStoresForWhere(setWhere, neededStores);
			});
		}
		if (query.data?.todos?.updateMany) {
			neededStores.add('Todo');
			IDBUtils.convertToArray(query.data.todos.updateMany).forEach((update) => {
				this.client.todo
					._getNeededStoresForUpdate(update as Prisma.Args<Prisma.TodoDelegate, 'update'>)
					.forEach((store) => neededStores.add(store));
			});
		}
		if (query.data?.todos?.update) {
			neededStores.add('Todo');
			IDBUtils.convertToArray(query.data.todos.update).forEach((update) => {
				this.client.todo
					._getNeededStoresForUpdate(update as Prisma.Args<Prisma.TodoDelegate, 'update'>)
					.forEach((store) => neededStores.add(store));
			});
		}
		if (query.data?.todos?.upsert) {
			neededStores.add('Todo');
			IDBUtils.convertToArray(query.data.todos.upsert).forEach((upsert) => {
				const update = {
					where: upsert.where,
					data: { ...upsert.update, ...upsert.create }
				} as Prisma.Args<Prisma.TodoDelegate, 'update'>;
				this.client.todo
					._getNeededStoresForUpdate(update)
					.forEach((store) => neededStores.add(store));
			});
		}
		if (query.data?.todos?.delete || query.data?.todos?.deleteMany) {
			this.client.todo._getNeededStoresForNestedDelete(neededStores);
		}
		if (query.data?.id !== undefined) {
			neededStores.add('Todo');
		}
		return neededStores;
	}
	_getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
		neededStores.add('User');
		this.client.todo._getNeededStoresForNestedDelete(neededStores);
	}
	private _removeNestedCreateData<D extends Prisma.Args<Prisma.UserDelegate, 'create'>['data']>(
		data: D
	): Prisma.Result<Prisma.UserDelegate, object, 'findFirstOrThrow'> {
		const recordWithoutNestedCreate = structuredClone(data);
		delete recordWithoutNestedCreate?.todos;
		return recordWithoutNestedCreate as Prisma.Result<
			Prisma.UserDelegate,
			object,
			'findFirstOrThrow'
		>;
	}
	private _preprocessListFields(
		records: Prisma.Result<Prisma.UserDelegate, object, 'findMany'>
	): void {}
	async findMany<Q extends Prisma.Args<Prisma.UserDelegate, 'findMany'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'findMany'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		const records = await this._applyWhereClause(
			await tx.objectStore('User').getAll(),
			query?.where,
			tx
		);
		await this._applyOrderByClause(records, query?.orderBy, tx);
		const relationAppliedRecords = (await this._applyRelations(
			records,
			tx,
			query
		)) as Prisma.Result<Prisma.UserDelegate, object, 'findFirstOrThrow'>[];
		const selectClause = query?.select;
		let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
		if (query?.distinct) {
			const distinctFields = IDBUtils.convertToArray(query.distinct);
			const seen = new Set<string>();
			selectAppliedRecords = selectAppliedRecords.filter((record) => {
				const key = distinctFields.map((field) => record[field]).join('|');
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		}
		this._preprocessListFields(selectAppliedRecords);
		return selectAppliedRecords as Prisma.Result<Prisma.UserDelegate, Q, 'findMany'>;
	}
	async findFirst<Q extends Prisma.Args<Prisma.UserDelegate, 'findFirst'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'findFirst'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		return (await this.findMany(query, { tx }))[0] ?? null;
	}
	async findFirstOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, 'findFirstOrThrow'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'findFirstOrThrow'>> {
		const { tx: txOption } = options ?? {};
		const localCreatedTx = txOption == null;
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		const record = await this.findFirst(query, { tx });
		if (!record) {
			if (localCreatedTx) {
				try {
					tx.abort();
				} catch {
					// Transaction may already be inactive
				}
			}
			throw new Error('Record not found');
		}
		return record;
	}
	async findUnique<Q extends Prisma.Args<Prisma.UserDelegate, 'findUnique'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'findUnique'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		let record;
		if (query.where.id !== undefined) {
			record = await tx.objectStore('User').get([query.where.id]);
		}
		if (!record) return null;

		const recordWithRelations = this._applySelectClause(
			await this._applyRelations(
				await this._applyWhereClause([record], query.where, tx),
				tx,
				query
			),
			query.select
		)[0];
		this._preprocessListFields([recordWithRelations]);
		return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, 'findUnique'>;
	}
	async findUniqueOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, 'findUniqueOrThrow'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'findUniqueOrThrow'>> {
		const { tx: txOption } = options ?? {};
		const localCreatedTx = txOption == null;
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		const record = await this.findUnique(query, { tx });
		if (!record) {
			if (localCreatedTx) {
				try {
					tx.abort();
				} catch {
					// Transaction may already be inactive
				}
			}
			throw new Error('Record not found');
		}
		return record;
	}
	async count<Q extends Prisma.Args<Prisma.UserDelegate, 'count'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'count'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx = tx ?? this.client._db.transaction(['User'], 'readonly');
		if (!query?.select || query.select === true) {
			const records = await this.findMany({ where: query?.where }, { tx });
			return records.length as Prisma.Result<Prisma.UserDelegate, Q, 'count'>;
		}
		const result: Partial<Record<keyof Prisma.UserCountAggregateInputType, number>> = {};
		for (const key of Object.keys(query.select)) {
			const typedKey = key as keyof typeof query.select;
			if (typedKey === '_all') {
				result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
				continue;
			}
			result[typedKey] = (
				await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
			).length;
		}
		return result as Prisma.Result<Prisma.UserDelegate, Q, 'count'>;
	}
	async create<Q extends Prisma.Args<Prisma.UserDelegate, 'create'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'create'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const storesNeeded = this._getNeededStoresForCreate(query.data);
		tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), 'readwrite');
		const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
		const keyPath = await tx.objectStore('User').add(record);
		if (query.data?.todos?.create) {
			for (const elem of IDBUtils.convertToArray(query.data.todos.create)) {
				await this.client.todo.create(
					{
						data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
							Prisma.TodoDelegate,
							'create'
						>['data']
					},
					{ tx, silent, addToOutbox }
				);
			}
		}
		if (query.data?.todos?.connect) {
			await Promise.all(
				IDBUtils.convertToArray(query.data.todos.connect).map(async (connectWhere) => {
					await this.client.todo.update(
						{ where: connectWhere, data: { userId: keyPath[0] } },
						{ tx, silent, addToOutbox }
					);
				})
			);
		}
		if (query.data?.todos?.connectOrCreate) {
			await Promise.all(
				IDBUtils.convertToArray(query.data.todos.connectOrCreate).map(async (connectOrCreate) => {
					await this.client.todo.upsert(
						{
							where: connectOrCreate.where,
							create: { ...connectOrCreate.create, userId: keyPath[0] } as NonNullable<
								Prisma.Args<Prisma.TodoDelegate, 'create'>['data']
							>,
							update: { userId: keyPath[0] }
						},
						{ tx, silent, addToOutbox }
					);
				})
			);
		}
		if (query.data?.todos?.createMany) {
			await this.client.todo.createMany(
				{
					data: IDBUtils.convertToArray(query.data.todos.createMany.data).map((createData) => ({
						...createData,
						userId: keyPath[0]
					}))
				},
				{ tx, silent, addToOutbox }
			);
		}
		const data = (await tx.objectStore('User').get(keyPath))!;
		const recordsWithRelations = this._applySelectClause(
			await this._applyRelations<object>([data], tx, query),
			query.select
		)[0];
		this._preprocessListFields([recordsWithRelations]);
		await this.emit('create', keyPath, undefined, data, silent, addToOutbox);
		return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, 'create'>;
	}
	async createMany<Q extends Prisma.Args<Prisma.UserDelegate, 'createMany'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'createMany'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const createManyData = IDBUtils.convertToArray(query.data);
		tx = tx ?? this.client._db.transaction(['User'], 'readwrite');
		for (const createData of createManyData) {
			const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
			const keyPath = await tx.objectStore('User').add(record);
			await this.emit('create', keyPath, undefined, record, silent, addToOutbox);
		}
		return { count: createManyData.length };
	}
	async createManyAndReturn<Q extends Prisma.Args<Prisma.UserDelegate, 'createManyAndReturn'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'createManyAndReturn'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const createManyData = IDBUtils.convertToArray(query.data);
		const records: Prisma.Result<Prisma.UserDelegate, object, 'findMany'> = [];
		tx = tx ?? this.client._db.transaction(['User'], 'readwrite');
		for (const createData of createManyData) {
			const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
			const keyPath = await tx.objectStore('User').add(record);
			await this.emit('create', keyPath, undefined, record, silent, addToOutbox);
			records.push(this._applySelectClause([record], query.select)[0]);
		}
		this._preprocessListFields(records);
		return records as Prisma.Result<Prisma.UserDelegate, Q, 'createManyAndReturn'>;
	}
	async delete<Q extends Prisma.Args<Prisma.UserDelegate, 'delete'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'delete'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const storesNeeded = this._getNeededStoresForFind(query);
		this._getNeededStoresForNestedDelete(storesNeeded);
		tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), 'readwrite');
		const record = await this.findUnique(query, { tx });
		if (!record) throw new Error('Record not found');
		await this.client.todo.deleteMany(
			{
				where: { userId: record.id }
			},
			{ tx, silent, addToOutbox }
		);
		await tx.objectStore('User').delete([record.id]);
		await this.emit('delete', [record.id], undefined, record, silent, addToOutbox);
		return record;
	}
	async deleteMany<Q extends Prisma.Args<Prisma.UserDelegate, 'deleteMany'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'deleteMany'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const storesNeeded = this._getNeededStoresForFind(query);
		this._getNeededStoresForNestedDelete(storesNeeded);
		tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), 'readwrite');
		const records = await this.findMany(query, { tx });
		for (const record of records) {
			await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
		}
		return { count: records.length };
	}
	async update<Q extends Prisma.Args<Prisma.UserDelegate, 'update'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'update'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), 'readwrite');
		const record = await this.findUnique({ where: query.where }, { tx });
		if (record === null) {
			tx.abort();
			throw new Error('Record not found');
		}
		const startKeyPath: PrismaIDBSchema['User']['key'] = [record.id];
		const stringFields = ['id', 'name'] as const;
		for (const field of stringFields) {
			IDBUtils.handleStringUpdateField(record, field, query.data[field]);
		}
		if (query.data.todos) {
			if (query.data.todos.connect) {
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.connect).map(async (connectWhere) => {
						await this.client.todo.update(
							{ where: connectWhere, data: { userId: record.id } },
							{ tx, silent, addToOutbox }
						);
					})
				);
			}
			if (query.data.todos.disconnect) {
				throw new Error('Cannot disconnect required relation');
			}
			if (query.data.todos.create) {
				const createData = Array.isArray(query.data.todos.create)
					? query.data.todos.create
					: [query.data.todos.create];
				for (const elem of createData) {
					await this.client.todo.create(
						{
							data: { ...elem, userId: record.id } as Prisma.Args<
								Prisma.TodoDelegate,
								'create'
							>['data']
						},
						{ tx, silent, addToOutbox }
					);
				}
			}
			if (query.data.todos.createMany) {
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.createMany.data).map(async (createData) => {
						await this.client.todo.create(
							{ data: { ...createData, userId: record.id } },
							{ tx, silent, addToOutbox }
						);
					})
				);
			}
			if (query.data.todos.update) {
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.update).map(async (updateData) => {
						await this.client.todo.update(updateData, { tx, silent, addToOutbox });
					})
				);
			}
			if (query.data.todos.updateMany) {
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.updateMany).map(async (updateData) => {
						await this.client.todo.updateMany(updateData, { tx, silent, addToOutbox });
					})
				);
			}
			if (query.data.todos.upsert) {
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.upsert).map(async (upsertData) => {
						await this.client.todo.upsert(
							{
								...upsertData,
								where: { ...upsertData.where, userId: record.id },
								create: { ...upsertData.create, userId: record.id } as Prisma.Args<
									Prisma.TodoDelegate,
									'upsert'
								>['create']
							},
							{ tx, silent, addToOutbox }
						);
					})
				);
			}
			if (query.data.todos.delete) {
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.delete).map(async (deleteData) => {
						await this.client.todo.delete(
							{ where: { ...deleteData, userId: record.id } },
							{ tx, silent, addToOutbox }
						);
					})
				);
			}
			if (query.data.todos.deleteMany) {
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.deleteMany).map(async (deleteData) => {
						await this.client.todo.deleteMany(
							{ where: { ...deleteData, userId: record.id } },
							{ tx, silent, addToOutbox }
						);
					})
				);
			}
			if (query.data.todos.set) {
				const existing = await this.client.todo.findMany({ where: { userId: record.id } }, { tx });
				if (existing.length > 0) {
					throw new Error('Cannot set required relation');
				}
				await Promise.all(
					IDBUtils.convertToArray(query.data.todos.set).map(async (setData) => {
						await this.client.todo.update(
							{ where: setData, data: { userId: record.id } },
							{ tx, silent, addToOutbox }
						);
					})
				);
			}
		}
		const endKeyPath: PrismaIDBSchema['User']['key'] = [record.id];
		for (let i = 0; i < startKeyPath.length; i++) {
			if (startKeyPath[i] !== endKeyPath[i]) {
				if ((await tx.objectStore('User').get(endKeyPath)) !== undefined) {
					throw new Error('Record with the same keyPath already exists');
				}
				await tx.objectStore('User').delete(startKeyPath);
				break;
			}
		}
		const keyPath = await tx.objectStore('User').put(record);
		await this.emit('update', keyPath, startKeyPath, record, silent, addToOutbox);
		for (let i = 0; i < startKeyPath.length; i++) {
			if (startKeyPath[i] !== endKeyPath[i]) {
				await this.client.todo.updateMany(
					{
						where: { userId: startKeyPath[0] },
						data: { userId: endKeyPath[0] }
					},
					{ tx, silent, addToOutbox }
				);
				break;
			}
		}
		const recordWithRelations = (await this.findUnique(
			{
				where: { id: keyPath[0] }
			},
			{ tx }
		))!;
		return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, 'update'>;
	}
	async updateMany<Q extends Prisma.Args<Prisma.UserDelegate, 'updateMany'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'updateMany'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readwrite');
		const records = await this.findMany({ where: query.where }, { tx });
		await Promise.all(
			records.map(async (record) => {
				await this.update(
					{ where: { id: record.id }, data: query.data },
					{ tx, silent, addToOutbox }
				);
			})
		);
		return { count: records.length };
	}
	async upsert<Q extends Prisma.Args<Prisma.UserDelegate, 'upsert'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'upsert'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const neededStores = this._getNeededStoresForUpdate({
			...query,
			data: { ...query.update, ...query.create } as Prisma.Args<
				Prisma.UserDelegate,
				'update'
			>['data']
		});
		tx = tx ?? this.client._db.transaction(Array.from(neededStores), 'readwrite');
		let record = await this.findUnique({ where: query.where }, { tx });
		if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
		else
			record = await this.update(
				{ where: query.where, data: query.update },
				{ tx, silent, addToOutbox }
			);
		record = await this.findUniqueOrThrow(
			{ where: { id: record.id }, select: query.select, include: query.include },
			{ tx }
		);
		return record as Prisma.Result<Prisma.UserDelegate, Q, 'upsert'>;
	}
	async aggregate<Q extends Prisma.Args<Prisma.UserDelegate, 'aggregate'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.UserDelegate, Q, 'aggregate'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx = tx ?? this.client._db.transaction(['User'], 'readonly');
		const records = await this.findMany({ where: query?.where }, { tx });
		const result: Partial<Prisma.Result<Prisma.UserDelegate, Q, 'aggregate'>> = {};
		if (query?._count) {
			if (query._count === true) {
				(result._count as number) = records.length;
			} else {
				for (const key of Object.keys(query._count)) {
					const typedKey = key as keyof typeof query._count;
					if (typedKey === '_all') {
						(result._count as Record<string, number>)[typedKey] = records.length;
						continue;
					}
					(result._count as Record<string, number>)[typedKey] = (
						await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
					).length;
				}
			}
		}
		if (query?._min) {
			const minResult = {} as Prisma.Result<Prisma.UserDelegate, Q, 'aggregate'>['_min'];
			const stringFields = ['id', 'name'] as const;
			for (const field of stringFields) {
				if (!query._min[field]) continue;
				const values = records
					.map((record) => record[field] as string)
					.filter((value) => value !== undefined);
				(minResult[field as keyof typeof minResult] as string) = values.sort()[0];
			}
			result._min = minResult;
		}
		if (query?._max) {
			const maxResult = {} as Prisma.Result<Prisma.UserDelegate, Q, 'aggregate'>['_max'];
			const stringFields = ['id', 'name'] as const;
			for (const field of stringFields) {
				if (!query._max[field]) continue;
				const values = records
					.map((record) => record[field] as string)
					.filter((value) => value !== undefined);
				(maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
			}
			result._max = maxResult;
		}
		return result as unknown as Prisma.Result<Prisma.UserDelegate, Q, 'aggregate'>;
	}
}
class TodoIDBClass extends BaseIDBModelClass<'Todo'> {
	constructor(client: PrismaIDBClient, keyPath: string[]) {
		super(client, keyPath, 'Todo');
	}

	private async _applyWhereClause<
		W extends Prisma.Args<Prisma.TodoDelegate, 'findFirstOrThrow'>['where'],
		R extends Prisma.Result<Prisma.TodoDelegate, object, 'findFirstOrThrow'>
	>(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
		if (!whereClause) return records;
		records = await IDBUtils.applyLogicalFilters<Prisma.TodoDelegate, R, W>(
			records,
			whereClause,
			tx,
			this.keyPath,
			this._applyWhereClause.bind(this)
		);
		return (
			await Promise.all(
				records.map(async (record) => {
					const stringFields = ['id', 'title', 'userId'] as const;
					for (const field of stringFields) {
						if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
					}
					const booleanFields = ['completed'] as const;
					for (const field of booleanFields) {
						if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return null;
					}
					if (whereClause.user) {
						const { is, isNot, ...rest } = whereClause.user;
						if (is !== null && is !== undefined) {
							const relatedRecord = await this.client.user.findFirst(
								{ where: { ...is, id: record.userId } },
								{ tx }
							);
							if (!relatedRecord) return null;
						}
						if (isNot !== null && isNot !== undefined) {
							const relatedRecord = await this.client.user.findFirst(
								{ where: { ...isNot, id: record.userId } },
								{ tx }
							);
							if (relatedRecord) return null;
						}
						if (Object.keys(rest).length) {
							const relatedRecord = await this.client.user.findFirst(
								{ where: { ...whereClause.user, id: record.userId } },
								{ tx }
							);
							if (!relatedRecord) return null;
						}
					}
					return record;
				})
			)
		).filter((result) => result !== null);
	}
	private _applySelectClause<S extends Prisma.Args<Prisma.TodoDelegate, 'findMany'>['select']>(
		records: Prisma.Result<Prisma.TodoDelegate, object, 'findFirstOrThrow'>[],
		selectClause: S
	): Prisma.Result<Prisma.TodoDelegate, { select: S }, 'findFirstOrThrow'>[] {
		if (!selectClause) {
			return records as Prisma.Result<Prisma.TodoDelegate, { select: S }, 'findFirstOrThrow'>[];
		}
		return records.map((record) => {
			const partialRecord: Partial<typeof record> = record;
			for (const untypedKey of ['id', 'title', 'completed', 'user', 'userId']) {
				const key = untypedKey as keyof typeof record & keyof S;
				if (!selectClause[key]) delete partialRecord[key];
			}
			return partialRecord;
		}) as Prisma.Result<Prisma.TodoDelegate, { select: S }, 'findFirstOrThrow'>[];
	}
	private async _applyRelations<Q extends Prisma.Args<Prisma.TodoDelegate, 'findMany'>>(
		records: Prisma.Result<Prisma.TodoDelegate, object, 'findFirstOrThrow'>[],
		tx: IDBUtils.TransactionType,
		query?: Q
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'findFirstOrThrow'>[]> {
		if (!query) return records as Prisma.Result<Prisma.TodoDelegate, Q, 'findFirstOrThrow'>[];
		const recordsWithRelations = records.map(async (record) => {
			const unsafeRecord = record as Record<string, unknown>;
			const attach_user = query.select?.user || query.include?.user;
			if (attach_user) {
				unsafeRecord['user'] = await this.client.user.findUnique(
					{
						...(attach_user === true ? {} : attach_user),
						where: { id: record.userId! }
					},
					{ tx }
				);
			}
			return unsafeRecord;
		});
		return (await Promise.all(recordsWithRelations)) as Prisma.Result<
			Prisma.TodoDelegate,
			Q,
			'findFirstOrThrow'
		>[];
	}
	async _applyOrderByClause<
		O extends Prisma.Args<Prisma.TodoDelegate, 'findMany'>['orderBy'],
		R extends Prisma.Result<Prisma.TodoDelegate, object, 'findFirstOrThrow'>
	>(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
		if (orderByClause === undefined) return;
		const orderByClauses = IDBUtils.convertToArray(orderByClause);
		const indexedKeys = await Promise.all(
			records.map(async (record) => {
				const keys = await Promise.all(
					orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx))
				);
				return { keys, record };
			})
		);
		indexedKeys.sort((a, b) => {
			for (let i = 0; i < orderByClauses.length; i++) {
				const clause = orderByClauses[i];
				const comparison = IDBUtils.genericComparator(
					a.keys[i],
					b.keys[i],
					this._resolveSortOrder(clause)
				);
				if (comparison !== 0) return comparison;
			}
			return 0;
		});
		for (let i = 0; i < records.length; i++) {
			records[i] = indexedKeys[i].record;
		}
	}
	async _resolveOrderByKey(
		record: Prisma.Result<Prisma.TodoDelegate, object, 'findFirstOrThrow'>,
		orderByInput: Prisma.TodoOrderByWithRelationInput,
		tx: IDBUtils.TransactionType
	): Promise<unknown> {
		const scalarFields = ['id', 'title', 'completed', 'userId'] as const;
		for (const field of scalarFields) if (orderByInput[field]) return record[field];
		if (orderByInput.user) {
			return await this.client.user._resolveOrderByKey(
				await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
				orderByInput.user,
				tx
			);
		}
	}
	_resolveSortOrder(
		orderByInput: Prisma.TodoOrderByWithRelationInput
	): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: 'first' | 'last' } {
		const scalarFields = ['id', 'title', 'completed', 'userId'] as const;
		for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
		if (orderByInput.user) {
			return this.client.user._resolveSortOrder(orderByInput.user);
		}
		throw new Error('No field in orderBy clause');
	}
	private async _fillDefaults<D extends Prisma.Args<Prisma.TodoDelegate, 'create'>['data']>(
		data: D,
		tx?: IDBUtils.ReadwriteTransactionType
	): Promise<D> {
		if (data === undefined) data = {} as NonNullable<D>;
		if (data.id === undefined) {
			data.id = uuidv4();
		}
		if (data.completed === undefined) {
			data.completed = false;
		}
		return data;
	}
	_getNeededStoresForWhere<W extends Prisma.Args<Prisma.TodoDelegate, 'findMany'>['where']>(
		whereClause: W,
		neededStores: Set<StoreNames<PrismaIDBSchema>>
	) {
		if (whereClause === undefined) return;
		for (const param of IDBUtils.LogicalParams) {
			if (whereClause[param]) {
				for (const clause of IDBUtils.convertToArray(whereClause[param])) {
					this._getNeededStoresForWhere(clause, neededStores);
				}
			}
		}
		if (whereClause.user) {
			neededStores.add('User');
			this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
		}
	}
	_getNeededStoresForFind<Q extends Prisma.Args<Prisma.TodoDelegate, 'findMany'>>(
		query?: Q
	): Set<StoreNames<PrismaIDBSchema>> {
		const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
		neededStores.add('Todo');
		this._getNeededStoresForWhere(query?.where, neededStores);
		if (query?.orderBy) {
			const orderBy = IDBUtils.convertToArray(query.orderBy);
			const orderBy_user = orderBy.find((clause) => clause.user);
			if (orderBy_user) {
				this.client.user
					._getNeededStoresForFind({ orderBy: orderBy_user.user })
					.forEach((storeName) => neededStores.add(storeName));
			}
		}
		if (query?.select?.user || query?.include?.user) {
			neededStores.add('User');
			if (typeof query.select?.user === 'object') {
				this.client.user
					._getNeededStoresForFind(query.select.user)
					.forEach((storeName) => neededStores.add(storeName));
			}
			if (typeof query.include?.user === 'object') {
				this.client.user
					._getNeededStoresForFind(query.include.user)
					.forEach((storeName) => neededStores.add(storeName));
			}
		}
		return neededStores;
	}
	_getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.TodoDelegate, 'create'>['data']>>(
		data: D
	): Set<StoreNames<PrismaIDBSchema>> {
		const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
		neededStores.add('Todo');
		if (data?.user) {
			neededStores.add('User');
			if (data.user.create) {
				const createData = Array.isArray(data.user.create) ? data.user.create : [data.user.create];
				createData.forEach((record) =>
					this.client.user
						._getNeededStoresForCreate(record)
						.forEach((storeName) => neededStores.add(storeName))
				);
			}
			if (data.user.connectOrCreate) {
				IDBUtils.convertToArray(data.user.connectOrCreate).forEach((record) =>
					this.client.user
						._getNeededStoresForCreate(record.create)
						.forEach((storeName) => neededStores.add(storeName))
				);
			}
		}
		if (data?.userId !== undefined) {
			neededStores.add('User');
		}
		return neededStores;
	}
	_getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.TodoDelegate, 'update'>>(
		query: Partial<Q>
	): Set<StoreNames<PrismaIDBSchema>> {
		const neededStores = this._getNeededStoresForFind(query).union(
			this._getNeededStoresForCreate(
				query.data as Prisma.Args<Prisma.TodoDelegate, 'create'>['data']
			)
		);
		if (query.data?.user?.connect) {
			neededStores.add('User');
			IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
				this.client.user._getNeededStoresForWhere(connect, neededStores);
			});
		}
		if (query.data?.user?.update) {
			neededStores.add('User');
			IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
				this.client.user
					._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, 'update'>)
					.forEach((store) => neededStores.add(store));
			});
		}
		if (query.data?.user?.upsert) {
			neededStores.add('User');
			IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
				const update = {
					where: upsert.where,
					data: { ...upsert.update, ...upsert.create }
				} as Prisma.Args<Prisma.UserDelegate, 'update'>;
				this.client.user
					._getNeededStoresForUpdate(update)
					.forEach((store) => neededStores.add(store));
			});
		}
		return neededStores;
	}
	_getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
		neededStores.add('Todo');
	}
	private _removeNestedCreateData<D extends Prisma.Args<Prisma.TodoDelegate, 'create'>['data']>(
		data: D
	): Prisma.Result<Prisma.TodoDelegate, object, 'findFirstOrThrow'> {
		const recordWithoutNestedCreate = structuredClone(data);
		delete recordWithoutNestedCreate?.user;
		return recordWithoutNestedCreate as Prisma.Result<
			Prisma.TodoDelegate,
			object,
			'findFirstOrThrow'
		>;
	}
	private _preprocessListFields(
		records: Prisma.Result<Prisma.TodoDelegate, object, 'findMany'>
	): void {}
	async findMany<Q extends Prisma.Args<Prisma.TodoDelegate, 'findMany'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'findMany'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		const records = await this._applyWhereClause(
			await tx.objectStore('Todo').getAll(),
			query?.where,
			tx
		);
		await this._applyOrderByClause(records, query?.orderBy, tx);
		const relationAppliedRecords = (await this._applyRelations(
			records,
			tx,
			query
		)) as Prisma.Result<Prisma.TodoDelegate, object, 'findFirstOrThrow'>[];
		const selectClause = query?.select;
		let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
		if (query?.distinct) {
			const distinctFields = IDBUtils.convertToArray(query.distinct);
			const seen = new Set<string>();
			selectAppliedRecords = selectAppliedRecords.filter((record) => {
				const key = distinctFields.map((field) => record[field]).join('|');
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		}
		this._preprocessListFields(selectAppliedRecords);
		return selectAppliedRecords as Prisma.Result<Prisma.TodoDelegate, Q, 'findMany'>;
	}
	async findFirst<Q extends Prisma.Args<Prisma.TodoDelegate, 'findFirst'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'findFirst'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		return (await this.findMany(query, { tx }))[0] ?? null;
	}
	async findFirstOrThrow<Q extends Prisma.Args<Prisma.TodoDelegate, 'findFirstOrThrow'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'findFirstOrThrow'>> {
		const { tx: txOption } = options ?? {};
		const localCreatedTx = txOption == null;
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		const record = await this.findFirst(query, { tx });
		if (!record) {
			if (localCreatedTx) {
				try {
					tx.abort();
				} catch {
					// Transaction may already be inactive
				}
			}
			throw new Error('Record not found');
		}
		return record;
	}
	async findUnique<Q extends Prisma.Args<Prisma.TodoDelegate, 'findUnique'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'findUnique'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		let record;
		if (query.where.id !== undefined) {
			record = await tx.objectStore('Todo').get([query.where.id]);
		}
		if (!record) return null;

		const recordWithRelations = this._applySelectClause(
			await this._applyRelations(
				await this._applyWhereClause([record], query.where, tx),
				tx,
				query
			),
			query.select
		)[0];
		this._preprocessListFields([recordWithRelations]);
		return recordWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, 'findUnique'>;
	}
	async findUniqueOrThrow<Q extends Prisma.Args<Prisma.TodoDelegate, 'findUniqueOrThrow'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'findUniqueOrThrow'>> {
		const { tx: txOption } = options ?? {};
		const localCreatedTx = txOption == null;
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readonly');
		const record = await this.findUnique(query, { tx });
		if (!record) {
			if (localCreatedTx) {
				try {
					tx.abort();
				} catch {
					// Transaction may already be inactive
				}
			}
			throw new Error('Record not found');
		}
		return record;
	}
	async count<Q extends Prisma.Args<Prisma.TodoDelegate, 'count'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'count'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx = tx ?? this.client._db.transaction(['Todo'], 'readonly');
		if (!query?.select || query.select === true) {
			const records = await this.findMany({ where: query?.where }, { tx });
			return records.length as Prisma.Result<Prisma.TodoDelegate, Q, 'count'>;
		}
		const result: Partial<Record<keyof Prisma.TodoCountAggregateInputType, number>> = {};
		for (const key of Object.keys(query.select)) {
			const typedKey = key as keyof typeof query.select;
			if (typedKey === '_all') {
				result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
				continue;
			}
			result[typedKey] = (
				await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
			).length;
		}
		return result as Prisma.Result<Prisma.TodoDelegate, Q, 'count'>;
	}
	async create<Q extends Prisma.Args<Prisma.TodoDelegate, 'create'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'create'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const storesNeeded = this._getNeededStoresForCreate(query.data);
		tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), 'readwrite');
		if (query.data.user) {
			const fk: Partial<PrismaIDBSchema['User']['key']> = [];
			if (query.data.user?.create) {
				const record = await this.client.user.create(
					{ data: query.data.user.create },
					{ tx, silent, addToOutbox }
				);
				fk[0] = record.id;
			}
			if (query.data.user?.connect) {
				const record = await this.client.user.findUniqueOrThrow(
					{ where: query.data.user.connect },
					{ tx }
				);
				delete query.data.user.connect;
				fk[0] = record.id;
			}
			if (query.data.user?.connectOrCreate) {
				const record = await this.client.user.upsert(
					{
						where: query.data.user.connectOrCreate.where,
						create: query.data.user.connectOrCreate.create,
						update: {}
					},
					{ tx, silent, addToOutbox }
				);
				fk[0] = record.id;
			}
			const unsafeData = query.data as Record<string, unknown>;
			unsafeData.userId = fk[0];
			delete unsafeData.user;
		} else if (query.data?.userId !== undefined && query.data.userId !== null) {
			await this.client.user.findUniqueOrThrow(
				{
					where: { id: query.data.userId }
				},
				{ tx }
			);
		}
		const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
		const keyPath = await tx.objectStore('Todo').add(record);
		const data = (await tx.objectStore('Todo').get(keyPath))!;
		const recordsWithRelations = this._applySelectClause(
			await this._applyRelations<object>([data], tx, query),
			query.select
		)[0];
		this._preprocessListFields([recordsWithRelations]);
		await this.emit('create', keyPath, undefined, data, silent, addToOutbox);
		return recordsWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, 'create'>;
	}
	async createMany<Q extends Prisma.Args<Prisma.TodoDelegate, 'createMany'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'createMany'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const createManyData = IDBUtils.convertToArray(query.data);
		tx = tx ?? this.client._db.transaction(['Todo'], 'readwrite');
		for (const createData of createManyData) {
			const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
			const keyPath = await tx.objectStore('Todo').add(record);
			await this.emit('create', keyPath, undefined, record, silent, addToOutbox);
		}
		return { count: createManyData.length };
	}
	async createManyAndReturn<Q extends Prisma.Args<Prisma.TodoDelegate, 'createManyAndReturn'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'createManyAndReturn'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const createManyData = IDBUtils.convertToArray(query.data);
		const records: Prisma.Result<Prisma.TodoDelegate, object, 'findMany'> = [];
		tx = tx ?? this.client._db.transaction(['Todo'], 'readwrite');
		for (const createData of createManyData) {
			const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
			const keyPath = await tx.objectStore('Todo').add(record);
			await this.emit('create', keyPath, undefined, record, silent, addToOutbox);
			records.push(this._applySelectClause([record], query.select)[0]);
		}
		this._preprocessListFields(records);
		return records as Prisma.Result<Prisma.TodoDelegate, Q, 'createManyAndReturn'>;
	}
	async delete<Q extends Prisma.Args<Prisma.TodoDelegate, 'delete'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'delete'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const storesNeeded = this._getNeededStoresForFind(query);
		this._getNeededStoresForNestedDelete(storesNeeded);
		tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), 'readwrite');
		const record = await this.findUnique(query, { tx });
		if (!record) throw new Error('Record not found');
		await tx.objectStore('Todo').delete([record.id]);
		await this.emit('delete', [record.id], undefined, record, silent, addToOutbox);
		return record;
	}
	async deleteMany<Q extends Prisma.Args<Prisma.TodoDelegate, 'deleteMany'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'deleteMany'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const storesNeeded = this._getNeededStoresForFind(query);
		this._getNeededStoresForNestedDelete(storesNeeded);
		tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), 'readwrite');
		const records = await this.findMany(query, { tx });
		for (const record of records) {
			await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
		}
		return { count: records.length };
	}
	async update<Q extends Prisma.Args<Prisma.TodoDelegate, 'update'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'update'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), 'readwrite');
		const record = await this.findUnique({ where: query.where }, { tx });
		if (record === null) {
			tx.abort();
			throw new Error('Record not found');
		}
		const startKeyPath: PrismaIDBSchema['Todo']['key'] = [record.id];
		const stringFields = ['id', 'title', 'userId'] as const;
		for (const field of stringFields) {
			IDBUtils.handleStringUpdateField(record, field, query.data[field]);
		}
		const booleanFields = ['completed'] as const;
		for (const field of booleanFields) {
			IDBUtils.handleBooleanUpdateField(record, field, query.data[field]);
		}
		if (query.data.user) {
			if (query.data.user.connect) {
				const other = await this.client.user.findUniqueOrThrow(
					{ where: query.data.user.connect },
					{ tx }
				);
				record.userId = other.id;
			}
			if (query.data.user.create) {
				const other = await this.client.user.create(
					{ data: query.data.user.create },
					{ tx, silent, addToOutbox }
				);
				record.userId = other.id;
			}
			if (query.data.user.update) {
				const updateData = query.data.user.update.data ?? query.data.user.update;
				await this.client.user.update(
					{
						where: {
							...query.data.user.update.where,
							id: record.userId!
						} as Prisma.UserWhereUniqueInput,
						data: updateData
					},
					{ tx, silent, addToOutbox }
				);
			}
			if (query.data.user.upsert) {
				await this.client.user.upsert(
					{
						where: {
							...query.data.user.upsert.where,
							id: record.userId!
						} as Prisma.UserWhereUniqueInput,
						create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
							Prisma.UserDelegate,
							'upsert'
						>['create'],
						update: query.data.user.upsert.update
					},
					{ tx, silent, addToOutbox }
				);
			}
			if (query.data.user.connectOrCreate) {
				await this.client.user.upsert(
					{
						where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
						create: {
							...query.data.user.connectOrCreate.create,
							id: record.userId!
						} as Prisma.Args<Prisma.UserDelegate, 'upsert'>['create'],
						update: { id: record.userId! }
					},
					{ tx, silent, addToOutbox }
				);
			}
		}
		if (query.data.userId !== undefined) {
			const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
			if (!related) throw new Error('Related record not found');
		}
		const endKeyPath: PrismaIDBSchema['Todo']['key'] = [record.id];
		for (let i = 0; i < startKeyPath.length; i++) {
			if (startKeyPath[i] !== endKeyPath[i]) {
				if ((await tx.objectStore('Todo').get(endKeyPath)) !== undefined) {
					throw new Error('Record with the same keyPath already exists');
				}
				await tx.objectStore('Todo').delete(startKeyPath);
				break;
			}
		}
		const keyPath = await tx.objectStore('Todo').put(record);
		await this.emit('update', keyPath, startKeyPath, record, silent, addToOutbox);
		for (let i = 0; i < startKeyPath.length; i++) {
			if (startKeyPath[i] !== endKeyPath[i]) {
				break;
			}
		}
		const recordWithRelations = (await this.findUnique(
			{
				where: { id: keyPath[0] }
			},
			{ tx }
		))!;
		return recordWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, 'update'>;
	}
	async updateMany<Q extends Prisma.Args<Prisma.TodoDelegate, 'updateMany'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'updateMany'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		tx =
			tx ??
			this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), 'readwrite');
		const records = await this.findMany({ where: query.where }, { tx });
		await Promise.all(
			records.map(async (record) => {
				await this.update(
					{ where: { id: record.id }, data: query.data },
					{ tx, silent, addToOutbox }
				);
			})
		);
		return { count: records.length };
	}
	async upsert<Q extends Prisma.Args<Prisma.TodoDelegate, 'upsert'>>(
		query: Q,
		options?: {
			tx?: IDBUtils.ReadwriteTransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'upsert'>> {
		const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
		let tx = txOption;
		const neededStores = this._getNeededStoresForUpdate({
			...query,
			data: { ...query.update, ...query.create } as Prisma.Args<
				Prisma.TodoDelegate,
				'update'
			>['data']
		});
		tx = tx ?? this.client._db.transaction(Array.from(neededStores), 'readwrite');
		let record = await this.findUnique({ where: query.where }, { tx });
		if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
		else
			record = await this.update(
				{ where: query.where, data: query.update },
				{ tx, silent, addToOutbox }
			);
		record = await this.findUniqueOrThrow(
			{ where: { id: record.id }, select: query.select, include: query.include },
			{ tx }
		);
		return record as Prisma.Result<Prisma.TodoDelegate, Q, 'upsert'>;
	}
	async aggregate<Q extends Prisma.Args<Prisma.TodoDelegate, 'aggregate'>>(
		query?: Q,
		options?: {
			tx?: IDBUtils.TransactionType;
			silent?: boolean;
			addToOutbox?: boolean;
		}
	): Promise<Prisma.Result<Prisma.TodoDelegate, Q, 'aggregate'>> {
		const { tx: txOption } = options ?? {};
		let tx = txOption;
		tx = tx ?? this.client._db.transaction(['Todo'], 'readonly');
		const records = await this.findMany({ where: query?.where }, { tx });
		const result: Partial<Prisma.Result<Prisma.TodoDelegate, Q, 'aggregate'>> = {};
		if (query?._count) {
			if (query._count === true) {
				(result._count as number) = records.length;
			} else {
				for (const key of Object.keys(query._count)) {
					const typedKey = key as keyof typeof query._count;
					if (typedKey === '_all') {
						(result._count as Record<string, number>)[typedKey] = records.length;
						continue;
					}
					(result._count as Record<string, number>)[typedKey] = (
						await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
					).length;
				}
			}
		}
		if (query?._min) {
			const minResult = {} as Prisma.Result<Prisma.TodoDelegate, Q, 'aggregate'>['_min'];
			const stringFields = ['id', 'title', 'userId'] as const;
			for (const field of stringFields) {
				if (!query._min[field]) continue;
				const values = records
					.map((record) => record[field] as string)
					.filter((value) => value !== undefined);
				(minResult[field as keyof typeof minResult] as string) = values.sort()[0];
			}
			const booleanFields = ['completed'] as const;
			for (const field of booleanFields) {
				if (!query._min[field]) continue;
				const values = records
					.map((record) => record[field] as boolean)
					.filter((value) => value !== undefined);
				(minResult[field as keyof typeof minResult] as boolean) =
					values.length === 0 ? false : values.includes(false) ? false : true;
			}
			result._min = minResult;
		}
		if (query?._max) {
			const maxResult = {} as Prisma.Result<Prisma.TodoDelegate, Q, 'aggregate'>['_max'];
			const stringFields = ['id', 'title', 'userId'] as const;
			for (const field of stringFields) {
				if (!query._max[field]) continue;
				const values = records
					.map((record) => record[field] as string)
					.filter((value) => value !== undefined);
				(maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
			}
			const booleanFields = ['completed'] as const;
			for (const field of booleanFields) {
				if (!query._max[field]) continue;
				const values = records
					.map((record) => record[field] as boolean)
					.filter((value) => value !== undefined);
				(maxResult[field as keyof typeof maxResult] as boolean) =
					values.length === 0 ? false : values.includes(true);
			}
			result._max = maxResult;
		}
		return result as unknown as Prisma.Result<Prisma.TodoDelegate, Q, 'aggregate'>;
	}
}
class OutboxEventIDBClass extends BaseIDBModelClass<'OutboxEvent'> {
	constructor(client: PrismaIDBClient, keyPath: string[]) {
		super(client, keyPath, 'OutboxEvent');
	}

	async create(query: {
		data: Pick<OutboxEventRecord, 'entityKeyPath' | 'entityType' | 'operation' | 'payload'>;
	}): Promise<OutboxEventRecord> {
		const tx = this.client._db.transaction('OutboxEvent', 'readwrite');
		const store = tx.objectStore('OutboxEvent');

		const event: OutboxEventRecord = {
			id: crypto.randomUUID(),
			createdAt: new Date(),
			synced: false,
			syncedAt: null,
			tries: 0,
			lastError: null,
			...query.data
		};

		await store.add(event);
		await tx.done;

		return event;
	}

	async getNextBatch(options?: { limit?: number }): Promise<OutboxEventRecord[]> {
		const limit = options?.limit ?? 20;
		const tx = this.client._db.transaction('OutboxEvent', 'readonly');
		const store = tx.objectStore('OutboxEvent');

		// Get all unsynced events, ordered by createdAt
		const allEvents = await store.getAll();
		const unsynced = allEvents
			.filter((e) => !e.synced)
			.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

		return unsynced.slice(0, limit);
	}

	async markSynced(eventIds: string[], meta?: { syncedAt?: Date }): Promise<void> {
		const syncedAt = meta?.syncedAt ?? new Date();
		const tx = this.client._db.transaction('OutboxEvent', 'readwrite');
		const store = tx.objectStore('OutboxEvent');

		for (const id of eventIds) {
			const event = await store.get([id]);
			if (event) {
				await store.put({
					...event,
					synced: true,
					syncedAt
				});
			}
		}

		await tx.done;
	}

	async markFailed(eventId: string, error: string): Promise<void> {
		const tx = this.client._db.transaction('OutboxEvent', 'readwrite');
		const store = tx.objectStore('OutboxEvent');

		const event = await store.get([eventId]);
		if (event) {
			await store.put({
				...event,
				tries: (event.tries ?? 0) + 1,
				lastError: error
			});
		}

		await tx.done;
	}

	async stats(): Promise<{ unsynced: number; failed: number; lastError?: string }> {
		const tx = this.client._db.transaction('OutboxEvent', 'readonly');
		const store = tx.objectStore('OutboxEvent');
		const allEvents = await store.getAll();

		const unsynced = allEvents.filter((e) => !e.synced).length;
		const failed = allEvents.filter(
			(e) => e.lastError !== null && e.lastError !== undefined
		).length;
		const lastError = allEvents
			.filter((e) => e.lastError)
			.sort(
				(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
			)[0]?.lastError;

		return { unsynced, failed, lastError: lastError ?? undefined };
	}

	async clearSynced(options?: { olderThanDays?: number }): Promise<number> {
		const olderThanDays = options?.olderThanDays ?? 7;
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		const tx = this.client._db.transaction('OutboxEvent', 'readwrite');
		const store = tx.objectStore('OutboxEvent');
		const allEvents = await store.getAll();

		let deletedCount = 0;
		for (const event of allEvents) {
			if (event.synced && new Date(event.createdAt) < cutoffDate) {
				await store.delete([event.id]);
				deletedCount++;
			}
		}

		await tx.done;
		return deletedCount;
	}
}
