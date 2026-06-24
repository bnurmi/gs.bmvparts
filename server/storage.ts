import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, like, or, ilike, and, desc } from "drizzle-orm";
import {
  cars, categories, subcategories, parts, users,
  type Car, type InsertCar, type Category, type InsertCategory,
  type Subcategory, type InsertSubcategory, type Part, type InsertPart,
  type User, type InsertUser,
} from "@shared/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export interface IStorage {
  // Cars
  getCars(): Promise<Car[]>;
  getCar(id: number): Promise<Car | undefined>;
  createCar(car: InsertCar): Promise<Car>;
  updateCar(id: number, data: Partial<Car>): Promise<Car | undefined>;

  // Categories
  getCategoriesByCarId(carId: number): Promise<Category[]>;
  createCategory(cat: InsertCategory): Promise<Category>;
  deleteCategories(carId: number): Promise<void>;

  // Subcategories
  getSubcategoriesByCategoryId(categoryId: number): Promise<Subcategory[]>;
  createSubcategory(sub: InsertSubcategory): Promise<Subcategory>;

  // Parts
  getPartsBySubcategoryId(subcategoryId: number): Promise<Part[]>;
  getPartsByCarId(carId: number, search?: string, limit?: number, offset?: number): Promise<Part[]>;
  countPartsByCarId(carId: number, search?: string): Promise<number>;
  searchParts(search: string, carIds?: number[]): Promise<(Part & { subcategoryName: string; categoryName: string; carName: string })[]>;
  crossReferencePart(partNumberClean: string): Promise<{
    partNumber: string;
    partNumberClean: string;
    description: string;
    additionalInfo: string | null;
    weight: number | null;
    vehicles: { carId: number; carName: string; chassis: string; engine: string; bodyType: string; yearStart: number; yearEnd: number | null; categoryName: string; subcategoryName: string; quantity: string | null; itemNo: string | null }[];
  } | null>;
  createParts(parts: InsertPart[]): Promise<void>;
  countParts(): Promise<number>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  async getCars(): Promise<Car[]> {
    return db.select().from(cars).orderBy(cars.id);
  }

  async getCar(id: number): Promise<Car | undefined> {
    const [car] = await db.select().from(cars).where(eq(cars.id, id));
    return car;
  }

  async createCar(car: InsertCar): Promise<Car> {
    const [created] = await db.insert(cars).values(car).returning();
    return created;
  }

  async updateCar(id: number, data: Partial<Car>): Promise<Car | undefined> {
    const [updated] = await db.update(cars).set(data).where(eq(cars.id, id)).returning();
    return updated;
  }

  async getCategoriesByCarId(carId: number): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.carId, carId)).orderBy(categories.categoryId);
  }

  async createCategory(cat: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values(cat).returning();
    return created;
  }

  async deleteCategories(carId: number): Promise<void> {
    await db.delete(categories).where(eq(categories.carId, carId));
  }

  async getSubcategoriesByCategoryId(categoryId: number): Promise<Subcategory[]> {
    return db.select().from(subcategories).where(eq(subcategories.categoryId, categoryId)).orderBy(subcategories.subcategoryId);
  }

  async createSubcategory(sub: InsertSubcategory): Promise<Subcategory> {
    const [created] = await db.insert(subcategories).values(sub).returning();
    return created;
  }

  async getPartsBySubcategoryId(subcategoryId: number): Promise<Part[]> {
    return db.select().from(parts).where(eq(parts.subcategoryId, subcategoryId)).orderBy(parts.itemNo);
  }

  async getPartsByCarId(carId: number, search?: string, limit = 50, offset = 0): Promise<Part[]> {
    if (search) {
      return db.select().from(parts)
        .where(and(
          eq(parts.carId, carId),
          or(
            ilike(parts.description, `%${search}%`),
            ilike(parts.partNumber, `%${search}%`),
            ilike(parts.partNumberClean, `%${search}%`),
          )
        ))
        .limit(limit)
        .offset(offset);
    }
    return db.select().from(parts)
      .where(eq(parts.carId, carId))
      .limit(limit)
      .offset(offset);
  }

  async countPartsByCarId(carId: number, search?: string): Promise<number> {
    const { count } = await import("drizzle-orm");
    if (search) {
      const [{ value }] = await db.select({ value: count() }).from(parts)
        .where(and(
          eq(parts.carId, carId),
          or(
            ilike(parts.description, `%${search}%`),
            ilike(parts.partNumber, `%${search}%`),
          )
        ));
      return Number(value);
    }
    const [{ value }] = await db.select({ value: count() }).from(parts).where(eq(parts.carId, carId));
    return Number(value);
  }

  async searchParts(search: string, carIds?: number[]): Promise<(Part & { subcategoryName: string; categoryName: string; carName: string })[]> {
    const results = await db
      .select({
        id: parts.id,
        subcategoryId: parts.subcategoryId,
        carId: parts.carId,
        itemNo: parts.itemNo,
        partNumber: parts.partNumber,
        partNumberClean: parts.partNumberClean,
        description: parts.description,
        additionalInfo: parts.additionalInfo,
        partDate: parts.partDate,
        quantity: parts.quantity,
        weight: parts.weight,
        notes: parts.notes,
        subcategoryName: subcategories.name,
        categoryName: categories.name,
        carName: cars.displayName,
      })
      .from(parts)
      .leftJoin(subcategories, eq(parts.subcategoryId, subcategories.id))
      .leftJoin(categories, eq(subcategories.categoryId, categories.id))
      .leftJoin(cars, eq(parts.carId, cars.id))
      .where(
        or(
          ilike(parts.description, `%${search}%`),
          ilike(parts.partNumber, `%${search}%`),
          ilike(parts.partNumberClean, `%${search}%`),
        )
      )
      .limit(100);
    return results as any;
  }

  async crossReferencePart(partNumberClean: string): Promise<{
    partNumber: string;
    partNumberClean: string;
    description: string;
    additionalInfo: string | null;
    weight: number | null;
    vehicles: { carId: number; carName: string; chassis: string; engine: string; bodyType: string; yearStart: number; yearEnd: number | null; categoryName: string; subcategoryName: string; quantity: string | null; itemNo: string | null }[];
  } | null> {
    const results = await db
      .select({
        partNumber: parts.partNumber,
        partNumberClean: parts.partNumberClean,
        description: parts.description,
        additionalInfo: parts.additionalInfo,
        weight: parts.weight,
        quantity: parts.quantity,
        itemNo: parts.itemNo,
        carId: cars.id,
        carName: cars.displayName,
        chassis: cars.chassis,
        engine: cars.engine,
        bodyType: cars.bodyType,
        yearStart: cars.yearStart,
        yearEnd: cars.yearEnd,
        categoryName: categories.name,
        subcategoryName: subcategories.name,
      })
      .from(parts)
      .leftJoin(subcategories, eq(parts.subcategoryId, subcategories.id))
      .leftJoin(categories, eq(subcategories.categoryId, categories.id))
      .leftJoin(cars, eq(parts.carId, cars.id))
      .where(eq(parts.partNumberClean, partNumberClean));

    if (results.length === 0) return null;

    const first = results[0];
    const seen = new Set<string>();
    const vehicles = results
      .filter(r => {
        const key = `${r.carId}-${r.categoryName}-${r.subcategoryName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(r => ({
        carId: r.carId!,
        carName: r.carName || "",
        chassis: r.chassis || "",
        engine: r.engine || "",
        bodyType: r.bodyType || "",
        yearStart: r.yearStart || 0,
        yearEnd: r.yearEnd,
        categoryName: r.categoryName || "",
        subcategoryName: r.subcategoryName || "",
        quantity: r.quantity,
        itemNo: r.itemNo,
      }));

    return {
      partNumber: first.partNumber || "",
      partNumberClean: first.partNumberClean || partNumberClean,
      description: first.description || "",
      additionalInfo: first.additionalInfo,
      weight: first.weight,
      vehicles,
    };
  }

  async createParts(partsData: InsertPart[]): Promise<void> {
    if (partsData.length === 0) return;
    await db.insert(parts).values(partsData);
  }

  async countParts(): Promise<number> {
    const { count } = await import("drizzle-orm");
    const [{ value }] = await db.select({ value: count() }).from(parts);
    return Number(value);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const { randomUUID } = await import("crypto");
    const [created] = await db.insert(users).values({ ...user, id: randomUUID() }).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
