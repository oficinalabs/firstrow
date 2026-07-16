import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as authSchema from "./auth-schema";
import * as schema from "./schema";

// prepare: false — recomendado com poolers pgbouncer (Neon/Supabase).
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, {
  schema: { ...authSchema, ...schema },
});
