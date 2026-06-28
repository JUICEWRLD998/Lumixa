import { z } from 'zod';

/**
 * Runtime configuration, parsed from `process.env`. Scripts/apps are
 * responsible for loading `.env` (e.g. `import 'dotenv/config'`) BEFORE calling
 * {@link loadConfig}; core stays side-effect free and never reads files.
 */
export const ConfigSchema = z.object({
  txlineBase: z.string().url(),
  txlineDevBase: z.string().url(),
  solanaCluster: z.string().default('devnet'),
  solanaRpc: z.string().url(),
  walletSecret: z.string().optional(),
  serviceLevelId: z.coerce.number().int().default(1),
  durationWeeks: z.coerce.number().int().default(4),
  selectedLeagues: z.string().default('worldcup'),
  txlineJwt: z.string().optional(),
  txlineApiToken: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Parse + validate config from an env bag (defaults to `process.env`). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse({
    txlineBase: env.TXLINE_BASE,
    txlineDevBase: env.TXLINE_DEV_BASE,
    solanaCluster: env.SOLANA_CLUSTER,
    solanaRpc: env.SOLANA_RPC,
    walletSecret: env.WALLET_SECRET || undefined,
    serviceLevelId: env.SERVICE_LEVEL_ID,
    durationWeeks: env.DURATION_WEEKS,
    selectedLeagues: env.SELECTED_LEAGUES,
    txlineJwt: env.TXLINE_JWT || undefined,
    txlineApiToken: env.TXLINE_API_TOKEN || undefined,
  });
}
