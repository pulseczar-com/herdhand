<p align="center">
  <img src="assets/brand/icon.svg" alt="Herdhand logo" width="112">
</p>

# Herdhand

A mobile client for [Herdr](https://github.com/herdrdev/herdr), built by [PulseCzar](https://pulseczar.com/?utm_source=github&utm_medium=readme&utm_campaign=herdhand).

> [!WARNING]
> **Experimental.** Herdhand is an early build that we use internally. You are welcome to try it, but expect bugs and changes. A Google Play test release is coming soon.

Herdr is a terminal multiplexer: it keeps spaces, tabs and panes running on a machine, much like tmux. A pane can hold a shell, an SSH session or a coding agent. Herdhand is an Android app that connects to that machine over SSH, so you can check on your panes and answer your agents from your phone.

<!-- Screenshot: the machine list and a connected machine. -->

## Features

- Your machines on one page, each with its spaces, tabs and panes. Agents that wait for an answer show first.
- An Agents tab that lists every agent by state.
- A pane's text, reformatted for the phone, with a composer for a line of input and a key row (Esc, ^C, Tab, Up, Down, Enter, 1 to 6).
- On Herdr App, a banner over a blocked agent's pane says what it waits for (a question, a permission or a sign-in) and shows its message.
- A Claude Code pane on Herdr App opens as a chat: your prompts, the replies in Markdown, and each tool call as a row.
- An app lock with fingerprint, face or the screen lock. It is on by default.

## How it connects

1. You add a machine with its address, SSH port, user name and password.
2. On the first connection, the app shows the machine's SHA-256 host key fingerprint. Compare it with the machine's own (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`), then tap **Trust and connect**. The app pins that key; a different key later blocks the connection.
3. The app signs in with the password and runs Herdr's own bridge as a plain command: `hc connect` for Herdr App, or `herdr remote-api-bridge` for Herdr TUI. The bridge speaks JSON over the SSH channel.

Herdhand installs nothing on the machine. The password and the host key stay in Android's secure storage. Herdhand has no server and sends no data anywhere else; see the [privacy policy](PRIVACY.md).

## What you need

On the machine:

- Herdr App (`hc` on the `PATH` or in `~/.local/bin`), Herdr TUI (`herdr`), or both. With both, you pick one per machine.
- An SSH server that allows password login.
- A network path from the phone: the same LAN, the internet or a VPN.

To build the app:

- Node.js 22, [`just`](https://github.com/casey/just) and a free [Expo account](https://expo.dev/signup).
- An Android phone. Native code builds in the cloud on [EAS Build](https://docs.expo.dev/build/introduction/), so you need no Android SDK.

## Build and run

1. Install the packages:

   ```sh
   git clone https://github.com/pulseczar-com/herdhand.git
   cd herdhand
   just install
   ```

2. Optional: link your own EAS project. The project id defaults to the Herdhand project. To build under your own Expo account, run `just eas-init` to create a project, then put the id it prints in `.env` as `HERDHAND_EAS_PROJECT_ID`. Set `HERDHAND_EAS_OWNER` only when an Expo organization owns the project.

   ```sh
   cp .env.example .env
   npx eas-cli@latest login
   just eas-init
   ```

   The build server does not get your `.env`, so store the id once in the project's EAS `development` environment. Do this only if you set your own id. Store `HERDHAND_EAS_OWNER` the same way if you set it.

   ```sh
   npx eas-cli@latest env:create --environment development \
     --name HERDHAND_EAS_PROJECT_ID --value <project id> \
     --visibility plaintext
   ```

3. Build the development client with `just build-dev`. When the build ends, open the install link on your phone and install the APK. Rebuild only when native code or a native package changes.

4. Start the dev server with `just dev`, then open Herdhand on the phone. JavaScript changes load with no rebuild. When the phone is on another network, run `npx expo start --dev-client --tunnel` instead.

For a signed Google Play bundle, run `just build-release` and follow [`docs/play-console.md`](docs/play-console.md).

## Commands

| Command | What it does |
|---|---|
| `just install` | Install the npm packages |
| `just check` | Typecheck, lint and test (run before every commit) |
| `just test [path]` | Run the tests, or only those that match a path |
| `just eas-init` | Create the EAS project for your Expo account |
| `just dev` | Start the dev server |
| `just build-dev` | Build the development client on EAS |
| `just build-release` | Build a signed app bundle for Google Play on EAS |

## Project layout

| Path | What it holds |
|---|---|
| `app/` | Screens ([expo-router](https://docs.expo.dev/router/introduction/)) |
| `modules/ssh/` | The native SSH module: Kotlin on [sshj](https://github.com/hierynomus/sshj) |
| `src/ssh/` | Opening the bridge over SSH and detecting Herdr |
| `src/herdr/` | The Herdr App and Herdr TUI clients |
| `src/chat/`, `src/claude/` | The chat view and how a Claude Code transcript becomes it |
| `src/machines/` | The saved machines and the open connection |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). The Herdhand name and icon are not covered by the license; see [`TRADEMARKS.md`](TRADEMARKS.md).

---

### Built by PulseCzar

We manage our AI coding agents with Herdr, so we built Herdhand to make it easy to check on sessions from a phone. Herdhand is free and open source. Herdr is the work of its own maintainers. If you like Herdhand, give [Herdr](https://github.com/herdrdev/herdr) a star.

PulseCzar provides uptime monitoring for websites, APIs and cron jobs. Check it out at [pulseczar.com](https://pulseczar.com/?utm_source=github&utm_medium=readme&utm_campaign=herdhand).

<p align="center">
  <a href="https://pulseczar.com/?utm_source=github&utm_medium=readme&utm_campaign=herdhand">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/pulseczar-lockup-dark.png">
      <img src="assets/pulseczar-lockup-light.png" alt="PulseCzar uptime monitoring" width="130">
    </picture>
  </a>
</p>
