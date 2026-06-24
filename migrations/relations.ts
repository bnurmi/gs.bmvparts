import { relations } from "drizzle-orm/relations";
import { cars, categories, subcategories, parts, users, apiKeys, userCars, provisionedAccounts, subcategoryRealoemMap, realoemAuditFindings, realoemUnmatchedDiagrams, seoContentPages, seoRefreshQueue } from "./schema";

export const categoriesRelations = relations(categories, ({one, many}) => ({
	car: one(cars, {
		fields: [categories.carId],
		references: [cars.id]
	}),
	subcategories: many(subcategories),
}));

export const carsRelations = relations(cars, ({many}) => ({
	categories: many(categories),
	subcategories: many(subcategories),
	parts: many(parts),
	userCars: many(userCars),
	subcategoryRealoemMaps: many(subcategoryRealoemMap),
	realoemAuditFindings: many(realoemAuditFindings),
	realoemUnmatchedDiagrams: many(realoemUnmatchedDiagrams),
}));

export const subcategoriesRelations = relations(subcategories, ({one, many}) => ({
	car: one(cars, {
		fields: [subcategories.carId],
		references: [cars.id]
	}),
	category: one(categories, {
		fields: [subcategories.categoryId],
		references: [categories.id]
	}),
	parts: many(parts),
	subcategoryRealoemMaps: many(subcategoryRealoemMap),
	realoemAuditFindings: many(realoemAuditFindings),
}));

export const partsRelations = relations(parts, ({one}) => ({
	car: one(cars, {
		fields: [parts.carId],
		references: [cars.id]
	}),
	subcategory: one(subcategories, {
		fields: [parts.subcategoryId],
		references: [subcategories.id]
	}),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	user: one(users, {
		fields: [apiKeys.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	apiKeys: many(apiKeys),
	userCars: many(userCars),
	provisionedAccounts: many(provisionedAccounts),
}));

export const userCarsRelations = relations(userCars, ({one}) => ({
	car: one(cars, {
		fields: [userCars.matchedCarId],
		references: [cars.id]
	}),
	user: one(users, {
		fields: [userCars.userId],
		references: [users.id]
	}),
}));

export const provisionedAccountsRelations = relations(provisionedAccounts, ({one}) => ({
	user: one(users, {
		fields: [provisionedAccounts.userId],
		references: [users.id]
	}),
}));

export const subcategoryRealoemMapRelations = relations(subcategoryRealoemMap, ({one}) => ({
	car: one(cars, {
		fields: [subcategoryRealoemMap.carId],
		references: [cars.id]
	}),
	subcategory: one(subcategories, {
		fields: [subcategoryRealoemMap.subcategoryId],
		references: [subcategories.id]
	}),
}));

export const realoemAuditFindingsRelations = relations(realoemAuditFindings, ({one}) => ({
	car: one(cars, {
		fields: [realoemAuditFindings.carId],
		references: [cars.id]
	}),
	subcategory: one(subcategories, {
		fields: [realoemAuditFindings.subcategoryId],
		references: [subcategories.id]
	}),
}));

export const realoemUnmatchedDiagramsRelations = relations(realoemUnmatchedDiagrams, ({one}) => ({
	car: one(cars, {
		fields: [realoemUnmatchedDiagrams.carId],
		references: [cars.id]
	}),
}));

export const seoRefreshQueueRelations = relations(seoRefreshQueue, ({one}) => ({
	seoContentPage: one(seoContentPages, {
		fields: [seoRefreshQueue.pageId],
		references: [seoContentPages.id]
	}),
}));

export const seoContentPagesRelations = relations(seoContentPages, ({many}) => ({
	seoRefreshQueues: many(seoRefreshQueue),
}));