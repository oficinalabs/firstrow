import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { envServidor } from "@/lib/env";
import * as authSchema from "./auth-schema";
import * as schema from "./schema";

// prepare: false — recomendado com poolers pgbouncer (Neon/Supabase).
const client = postgres(envServidor.DATABASE_URL, { prepare: false });

export const db = drizzle(client, {
  schema: { ...authSchema, ...schema },
});
