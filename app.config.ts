import type { ConfigContext, ExpoConfig } from "expo/config";

const HERDHAND_EAS_PROJECT_ID = "6af255a7-b81d-4d75-9c3a-2a25d88cbd61";

// A fork sets its own id in .env (see .env.example). An empty value means no id, so `eas init`
// can create a project. The id is not a secret: it is inside every app build.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  owner: process.env.HERDHAND_EAS_OWNER || undefined,
  extra: {
    ...config.extra,
    eas: {
      projectId:
        (process.env.HERDHAND_EAS_PROJECT_ID ?? HERDHAND_EAS_PROJECT_ID) ||
        undefined,
    },
  },
});
