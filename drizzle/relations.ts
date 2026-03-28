import { relations } from "drizzle-orm/relations";
import { projects, endpoints, responses } from "./schema";

export const endpointsRelations = relations(endpoints, ({one, many}) => ({
	project: one(projects, {
		fields: [endpoints.projectId],
		references: [projects.id]
	}),
	responses: many(responses),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	endpoints: many(endpoints),
}));

export const responsesRelations = relations(responses, ({one}) => ({
	endpoint: one(endpoints, {
		fields: [responses.endpointId],
		references: [endpoints.id]
	}),
}));