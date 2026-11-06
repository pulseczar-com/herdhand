import type { ConfigContext, ExpoConfig } from "expo/config";

// Each EAS account builds under its own project, so the owner and project id come from the
// environment (see .env.example) instead of this file.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  owner: process.env.HERDHAND_EAS_OWNER || undefined,
  extra: {
    ...config.extra,
    eas: { projectId: process.env.HERDHAND_EAS_PROJECT_ID || undefined },
  },
});
