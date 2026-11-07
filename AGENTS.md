# Agent guide

Herdhand is an Android app (Expo, React Native, TypeScript) that connects to a machine running Herdr over SSH. Read `README.md` for the user view, the commands and the layout, and `CONTRIBUTING.md` for how to send a change.

## Rules

- **No personal details in this repository.** No names of people, email addresses, user names, host or machine names, IP addresses, home directory paths or private links, in code, docs, tests, commits or pull requests. Use placeholders such as `test-box.example.com`.
- **EAS-only native builds.** No local Android SDK, no `android/` or `ios/` folder, no `expo prebuild`. Native code builds on EAS (`just build-dev`).
- **Cloud builds are scarce.** Prefer the dev server (`just dev`): JavaScript changes need no build. Build only when `modules/ssh` or a native package changes.
- Run `just check` before every commit. It must pass.
- Write a failing test first for a change in behavior.
- Everything here is public: write code, comments, commits and docs for a stranger.

## Layout

- `app/`: screens, with expo-router. `_layout.tsx` holds the stack, the app lock and the machines provider.
- `modules/ssh/`: the native SSH module (Kotlin, sshj). It logs in with a password or the phone key (Android Keystore), checks the host key, streams the output of one plain command at a time as `onData` and `onClosed` events, and runs one-shot commands on a channel of their own with `run`. Its TypeScript API is `modules/ssh/src/SshModule.ts`.
- `src/ssh/bridge.ts` and `src/ssh/pairing.ts`: the only files that call the SSH module. `bridge.ts` logs in, detects the Herdr kind and starts its bridge. `pairing.ts` gives the phone key to a machine that runs `scripts/pair.sh`. `src/ssh/commands.ts` holds the shell commands.
- `src/herdr/backend.ts`: the `Backend` interface. `src/herdr/desktop.ts` (JSON-RPC 2.0, `hc connect`) and `src/herdr/tui.ts` (newline JSON, `herdr remote-api-bridge`) implement it for each kind.
- `src/machines/`: the machine list (AsyncStorage), passwords and host keys (expo-secure-store), and the one open connection (`MachineConnection.tsx`).

## Conventions

- Native, generic Android look: the system light or dark theme through expo-router's `ThemeProvider`, with green as the one accent (`src/navigationTheme.ts`), and platform controls. No custom theme system.
- Pure logic lives in small modules with table-driven Jest tests; screens and hooks stay thin.
- Secrets (passwords, host keys) go to expo-secure-store, never AsyncStorage.
- Imports from `src/` use the `@/` alias.
- Name things for what they are; comments say why, not what.
- American English in all text.
