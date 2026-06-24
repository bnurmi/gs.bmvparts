import { pgTable, text, integer, boolean, timestamp, real, serial, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cars = pgTable("cars", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  generation: text("generation").notNull(),
  series: text("series").notNull().default("M"),
  bodyType: text("body_type").notNull(),
  modelName: text("model_name").notNull(),
  displayName: text("display_name").notNull(),
  engine: text("engine"),
  yearStart: integer("year_start"),
  yearEnd: integer("year_end"),
  catalogUrl: text("catalog_url").notNull(),
  catalogId: text("catalog_id"),
  imageUrl: text("image_url"),
  scrapeStatus: text("scrape_status").notNull().default("idle"),
  scrapeProgress: integer("scrape_progress").default(0),
  totalCategories: integer("total_categories").default(0),
  totalSubcategories: integer("total_subcategories").default(0),
  totalParts: integer("total_parts").default(0),
  lastScrapedAt: timestamp("last_scraped_at"),
  scrapeError: text("scrape_error"),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  url: text("url").notNull(),
});

export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  subcategoryId: text("subcategory_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  url: text("url").notNull(),
  diagramImageUrl: text("diagram_image_url"),
});

export const parts = pgTable("parts", {
  id: serial("id").primaryKey(),
  subcategoryId: integer("subcategory_id").notNull().references(() => subcategories.id, { onDelete: "cascade" }),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  itemNo: text("item_no"),
  partNumber: text("part_number"),
  partNumberClean: text("part_number_clean"),
  description: text("description").notNull(),
  additionalInfo: text("additional_info"),
  partDate: text("part_date"),
  quantity: text("quantity"),
  weight: real("weight"),
  notes: text("notes"),
});

export const insertCarSchema = createInsertSchema(cars).omit({ id: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertSubcategorySchema = createInsertSchema(subcategories).omit({ id: true });
export const insertPartSchema = createInsertSchema(parts).omit({ id: true });

export type Car = typeof cars.$inferSelect;
export type InsertCar = z.infer<typeof insertCarSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Subcategory = typeof subcategories.$inferSelect;
export type InsertSubcategory = z.infer<typeof insertSubcategorySchema>;
export type Part = typeof parts.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;

// Users kept for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
