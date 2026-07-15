import type { Model, RootFilterQuery, UpdateQuery, PipelineStage } from "mongoose";
import { buildPaginated, toSortObject, type PaginationInput, type Paginated } from "@/shared/lib/pagination";

/**
 * Generic data-access base. Concrete repositories extend this to inherit
 * pagination, soft-delete-aware reads, and CRUD, while adding domain queries.
 * Services depend on repositories — never on Mongoose models directly.
 */
export abstract class BaseRepository<TDoc> {
  protected constructor(protected readonly model: Model<TDoc>) {}

  async findById(id: string): Promise<TDoc | null> {
    return this.model.findById(id).exec();
  }

  async findOne(filter: RootFilterQuery<TDoc>): Promise<TDoc | null> {
    return this.model.findOne(filter).exec();
  }

  async exists(filter: RootFilterQuery<TDoc>): Promise<boolean> {
    return (await this.model.exists(filter).exec()) != null;
  }

  async create(data: Partial<TDoc>): Promise<TDoc> {
    return this.model.create(data);
  }

  async updateById(id: string, update: UpdateQuery<TDoc>): Promise<TDoc | null> {
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async softDeleteById(id: string, actor?: string): Promise<TDoc | null> {
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
    filter: RootFilterQuery<TDoc>,
    pagination: PaginationInput,
    options: { populate?: string | string[] } = {},
  ): Promise<Paginated<TDoc>> {
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
