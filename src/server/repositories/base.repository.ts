import type { Model, QueryFilter, UpdateQuery, PipelineStage, HydratedDocument } from "mongoose";
import { buildPaginated, toSortObject, type PaginationInput, type Paginated } from "@/shared/lib/pagination";

/**
 * Generic data-access base. Concrete repositories extend this to inherit
 * pagination, soft-delete-aware reads, and CRUD, while adding domain queries.
 * Services depend on repositories — never on Mongoose models directly.
 *
 * `TRaw` is the plain document shape; reads return `HydratedDocument<TRaw>`.
 */
export abstract class BaseRepository<TRaw> {
  protected constructor(protected readonly model: Model<TRaw>) {}

  async findById(id: string): Promise<HydratedDocument<TRaw> | null> {
    return this.model.findById(id).exec();
  }

  async findOne(filter: QueryFilter<TRaw>): Promise<HydratedDocument<TRaw> | null> {
    return this.model.findOne(filter).exec();
  }

  async exists(filter: QueryFilter<TRaw>): Promise<boolean> {
    return (await this.model.exists(filter).exec()) != null;
  }

  async create(data: Partial<TRaw>): Promise<HydratedDocument<TRaw>> {
    return this.model.create(data);
  }

  async updateById(id: string, update: UpdateQuery<TRaw>): Promise<HydratedDocument<TRaw> | null> {
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async softDeleteById(id: string, actor?: string): Promise<HydratedDocument<TRaw> | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { deletedAt: new Date(), ...(actor ? { updatedBy: actor } : {}) } },
        { new: true },
      )
      .exec();
  }

  /** Offset pagination with an arbitrary filter. */
  async paginate(
    filter: QueryFilter<TRaw>,
    pagination: PaginationInput,
    options: { populate?: string | string[] } = {},
  ): Promise<Paginated<HydratedDocument<TRaw>>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;
    const sort = toSortObject(pagination);

    let query = this.model.find(filter).sort(sort).skip(skip).limit(limit);
    if (options.populate) query = query.populate(options.populate);

    const [items, total] = await Promise.all([
      query.exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return buildPaginated(items, total, { page, limit });
  }

  async aggregate<R = Record<string, unknown>>(pipeline: PipelineStage[]): Promise<R[]> {
    return this.model.aggregate<R>(pipeline).exec();
  }
}
