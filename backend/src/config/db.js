import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg; // pg uses default export, need to destructure like this

const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || '5432', 10),
});

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

