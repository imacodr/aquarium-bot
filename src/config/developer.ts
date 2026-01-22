/**
 * Bot Developer Configuration
 * Manages developer IDs from environment variable and database
 */

import { prisma } from "../database/prisma";

// Parse developer IDs from environment variable (comma-separated)
function getEnvDeveloperIds(): string[] {
  const envIds = process.env.BOT_DEVELOPER_IDS || "";
  return envIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d{17,19}$/.test(id));
}

// Cache for developer IDs from database
let dbDeveloperIdsCache: string[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get developer IDs from database
 */
async function getDbDeveloperIds(): Promise<string[]> {
  const now = Date.now();
  if (dbDeveloperIdsCache && now < cacheExpiry) {
    return dbDeveloperIdsCache;
  }

  try {
    const developers = await prisma.user.findMany({
      where: { isBotDeveloper: true },
      select: { discordId: true },
    });
    dbDeveloperIdsCache = developers.map((d) => d.discordId);
    cacheExpiry = now + CACHE_TTL;
    return dbDeveloperIdsCache;
  } catch (error) {
    console.error("Error fetching developer IDs from database:", error);
    return dbDeveloperIdsCache || [];
  }
}

/**
 * Check if a Discord user ID is a bot developer
 */
export async function isBotDeveloper(discordId: string): Promise<boolean> {
  // Check environment variable first (faster)
  const envIds = getEnvDeveloperIds();
  if (envIds.includes(discordId)) {
    return true;
  }

  // Check database
  const dbIds = await getDbDeveloperIds();
  return dbIds.includes(discordId);
}

/**
 * Check if a Discord user ID is a bot developer (sync version)
 * Only checks environment variable, use for quick checks where async is not available
 */
export function isBotDeveloperSync(discordId: string): boolean {
  const envIds = getEnvDeveloperIds();
  return envIds.includes(discordId);
}

/**
 * Get all developer IDs (from both env and database)
 */
export async function getAllDeveloperIds(): Promise<string[]> {
  const envIds = getEnvDeveloperIds();
  const dbIds = await getDbDeveloperIds();
  return [...new Set([...envIds, ...dbIds])];
}

/**
 * Clear the developer ID cache (call after updating isBotDeveloper flag)
 */
export function clearDeveloperCache(): void {
  dbDeveloperIdsCache = null;
  cacheExpiry = 0;
}

/**
 * Set a user as a bot developer in the database
 */
export async function setBotDeveloper(
  discordId: string,
  isDeveloper: boolean
): Promise<void> {
  await prisma.user.update({
    where: { discordId },
    data: { isBotDeveloper: isDeveloper },
  });
  clearDeveloperCache();
}

export const developerConfig = {
  isBotDeveloper,
  isBotDeveloperSync,
  getAllDeveloperIds,
  clearDeveloperCache,
  setBotDeveloper,
};
