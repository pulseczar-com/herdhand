# Google Play release

Answers for the Play Console and the steps to make a release build. The facts come from [`PRIVACY.md`](../PRIVACY.md).

## Build

1. In the EAS `production` environment, set `HERDHAND_EAS_PROJECT_ID` and `HERDHAND_EAS_OWNER` only if you build under your own Expo account. Use the same commands as for the `development` environment in the README.
2. Run `just build-release`. EAS makes a signed app bundle (`.aab`) with EAS-managed credentials and raises the version code by one.
3. Download the `.aab` from the build page.
4. In the Play Console, create a release in a testing track and upload the `.aab`. The first upload needs the Play Console store listing, the declarations below and the privacy policy link.

Privacy policy link: `https://pulseczar.com/herdhand/privacy`

## Data safety form

| Question | Answer |
|---|---|
| Does the app collect or share user data? | No |
| Is data encrypted in transit? | Not asked when collection is "No". If the form asks, answer: yes, SSH. |
| Can users ask to delete their data? | Not applicable. The developer holds no data. Removing a machine or uninstalling deletes the data on the phone. |
| Does the app use analytics, ads or third-party SDKs that collect data? | No |

Basis for "No": the developer never receives any data. The user name, password or phone key signature, the phone's public key when pairing, and typed input go only to the machine the user adds, over encrypted SSH, and the user starts each connection. Everything else stays on the phone. Check in the Console that Google's wording for data that is not collected covers this case.

## Foreground service declaration

Type: `specialUse`. Subtype text (from the manifest): "Keeps the SSH connection to the user's own machine open while the app is in the background, until the user disconnects."

Text for the declaration form:

> Herdhand is an SSH client for a Herdr terminal session on the user's own machine. The foreground service holds the open SSH connection while the app is in the background, so the user can leave the app and return to the same session without a new login. It shows a notification while it runs and stops when the user disconnects. No other foreground service type describes a long-lived SSH connection. The user starts the service by connecting to a machine.

## Declaration video and app access

- Declaration video: record the user starting a connection to a machine, leaving the app, and the service notification. Add the video link to the foreground service declaration.
- App access: no login is needed. Each user connects to their own machine, and the app has no accounts. Reviewers can tap "Try the demo" on the machine list, or under Settings, to see the app with sample data and no server. In the App access instructions, say that the app needs no login and name this demo.

## Other declarations

- Permissions: `POST_NOTIFICATIONS` for the foreground service notification, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_SPECIAL_USE` for the service above, and `CAMERA` to scan a pairing code.
- Target audience: adults. The app has no ads and no user-generated content.
