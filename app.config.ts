import type { ConfigContext, ExpoConfig } from "expo/config";

// The project id defaults to the Herdhand project. A fork sets its own id in .env (see
// .env.example). The id is not a secret: it is inside every app build. The owner is env only.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  owner: process.env.HERDHAND_EAS_OWNER || undefined,
  extra: {
    ...config.extra,
    eas: {
      projectId:
        process.env.HERDHAND_EAS_PROJECT_ID ||
        "6af255a7-b81d-4d75-9c3a-2a25d88cbd61",
    },
  },
});
