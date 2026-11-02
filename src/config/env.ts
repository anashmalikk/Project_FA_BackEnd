import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z
    .string()
    .min(1)
    .default("/api/v1")
    .transform((value) => {
      const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
      return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
    }),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  AWS_ACCESS_KEY: z.string().min(1),
  AWS_SECRET_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_BUCKET: z.string().min(1)
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const formattedErrors = parsedEnvironment.error.flatten().fieldErrors;

  throw new Error(
    `Invalid environment configuration: ${JSON.stringify(formattedErrors, null, 2)}`
  );
}

export const env = Object.freeze(parsedEnvironment.data);
export type Environment = typeof env;
