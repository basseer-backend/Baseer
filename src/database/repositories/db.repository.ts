import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  QueryDeepPartialEntity,
  Repository,
  UpdateResult,
} from 'typeorm';

export interface PaginatedResult<TEntity> {
  items: TEntity[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export abstract class DatabaseRepository<TEntity extends ObjectLiteral> {
  protected constructor(protected readonly model: Repository<TEntity>) {}

  async create(data: DeepPartial<TEntity>): Promise<TEntity> {
    const entity = this.model.create(data);
    return this.model.save(entity);
  }

  async createMany(data: DeepPartial<TEntity>[]): Promise<TEntity[]> {
    if (data.length === 0) {
      return [];
    }

    const entities = this.model.create(data);
    return this.model.save(entities);
  }

  async findOne(options: FindOneOptions<TEntity>): Promise<TEntity | null> {
    return this.model.findOne(options);
  }

  async find(options?: FindManyOptions<TEntity>): Promise<TEntity[]> {
    return this.model.find(options);
  }

  async findById(
    id: string,
    idProperty: keyof TEntity & string = 'id' as keyof TEntity & string,
  ): Promise<TEntity | null> {
    return this.model.findOne({
      where: { [idProperty]: id } as FindOptionsWhere<TEntity>,
    });
  }

  async count(options?: FindManyOptions<TEntity>): Promise<number> {
    return this.model.count(options);
  }

  async updateOne(
    where: FindOptionsWhere<TEntity>,
    data: QueryDeepPartialEntity<TEntity>,
  ): Promise<UpdateResult> {
    this.assertWhere(where);
    const existing = await this.findSingleMatch(where, 'updateOne');
    if (!existing) {
      return { generatedMaps: [], raw: [], affected: 0 };
    }

    return this.model.update(this.identityOf(existing), data);
  }

  async updateMany(
    where: FindOptionsWhere<TEntity>,
    data: QueryDeepPartialEntity<TEntity>,
  ): Promise<UpdateResult> {
    this.assertWhere(where);
    return this.model.update(where, data);
  }

  async deleteOne(where: FindOptionsWhere<TEntity>): Promise<DeleteResult> {
    this.assertWhere(where);
    const existing = await this.findSingleMatch(where, 'deleteOne');
    if (!existing) {
      return { raw: [], affected: 0 };
    }

    return this.model.delete(this.identityOf(existing));
  }

  async deleteMany(where: FindOptionsWhere<TEntity>): Promise<DeleteResult> {
    this.assertWhere(where);
    return this.model.delete(where);
  }

  async paginate(
    options: FindManyOptions<TEntity> = {},
    pagination: PaginationOptions = {},
  ): Promise<PaginatedResult<TEntity>> {
    const page =
      pagination.page !== undefined && pagination.page > 0
        ? Math.floor(pagination.page)
        : 1;
    const limit =
      pagination.limit !== undefined && pagination.limit > 0
        ? Math.floor(pagination.limit)
        : 20;
    const [items, total] = await this.model.findAndCount({
      ...options,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      pageCount: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  private assertWhere(where: FindOptionsWhere<TEntity>): void {
    if (Object.keys(where).length === 0) {
      throw new Error('A where condition is required.');
    }
  }

  private async findSingleMatch(
    where: FindOptionsWhere<TEntity>,
    operation: string,
  ): Promise<TEntity | null> {
    const matches = await this.model.find({ where, take: 2 });
    if (matches.length > 1) {
      throw new Error(`${operation} matched more than one row.`);
    }

    return matches[0] ?? null;
  }

  private identityOf(entity: TEntity): FindOptionsWhere<TEntity> {
    const identity = this.model.metadata.getEntityIdMap(entity);
    if (!identity) {
      throw new Error('The entity primary key could not be resolved.');
    }

    return identity as FindOptionsWhere<TEntity>;
  }
}
