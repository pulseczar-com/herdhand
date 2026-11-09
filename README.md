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
- The lists update by themselves when Herdr changes, for example when an agent waits, a tab opens or a pane closes. After a drop, the app reconnects by itself.
- A banner over a blocked agent's pane says what it waits for (a question, a permission or a sign-in) and shows its message.
- A pane of a [supported agent](#supported-agents) opens as a chat: your prompts, the replies in Markdown, and each tool call as a row. The app reads the agent's own transcript file over SSH and installs nothing on the machine.
- When Claude asks a question, the chat shows its options as buttons. When an agent waits on something the chat does not record, such as a permission prompt or a sign-in, a live screen card shows the end of the pane. An agent pane with no chat opens on its screen, with a line that says why.
- A shell pane opens as a chat: each command you send from the phone is a bubble with its output under it. The app knows a command has ended when the shell holds the foreground again. See [Shell panes](#shell-panes).
- A pane that works in a [Firstmate](https://github.com/kunchenguid/firstmate) home gets a **Bearings** button. See [Firstmate](#firstmate).
- Log in with a password, or pair by scanning a code so the phone logs in with its own key.
- An app lock with fingerprint, face or the screen lock. It is on by default.
- A demo with sample spaces, chats and Bearings, and no network. Tap **Try the demo** on the empty machine list, or in Settings.

## Shell panes

A command sent from the phone becomes a bubble, and the output of the command shows under it as plain text. Commands typed on the machine get no bubble. The view scrolls back to the pane as it was on open. The limits:

- The app shows no exit code.
- The app cuts a long output to the last 200 lines.
- A command typed on the machine shows only the end of its screen while it runs.
- A full-screen program, such as vim, started from the phone shows its whole screen, cut to the last 200 lines, until the shell holds the foreground again.
- The app expects a one-line prompt with no right-side prompt and no transient prompt. With another kind of prompt, the output can include prompt lines, or can show the whole screen with a note that it is cut.

## Firstmate

[Firstmate](https://github.com/kunchenguid/firstmate) is an open-source supervisor for coding agents. You talk to one agent, Firstmate. It plans the work, starts other agents in Herdr, watches them, and brings you the decisions and pull requests that need you.

Herdhand lets you keep up with Firstmate from your phone. Open the Firstmate pane to chat with it, as with any agent. Tap **Bearings** in the pane's header to see where the work stands:

- **Waiting on you:** decisions and tasks that need your answer.
- **In flight:** work that agents are doing now.
- **PRs:** pull requests that are open for review.
- **Secondmates:** other Firstmates that this Firstmate supervises.
- **Queued:** work that waits for its turn or for another task.
- **Landed:** work that merged recently.

Tap an item to see all of its details. From there, you can **Discuss** it, which sends Firstmate a note about it. You can also act on it: Done, Defer, Drop, Stop or Start now, as the item allows. Drop and Stop ask first. Firstmate reads each note and replies in its chat.

Bearings shows the last data at once, with its age. It refreshes every 30 seconds while it is open, and when you pull down. On the desktop, the Herdr sidebar mod herdr-firstmate-bearings gives the same view.

### How it works

The pane that runs the Firstmate has a **Bearings** button in its header. The pane's folder must be a Firstmate home (its `bin/fm-bearings-snapshot.sh` is executable), and the pane's process id or Claude session id must be the one the home records in `state/.lock` or `state/.lock-session`. A Claude session or a shell that only starts in that folder gets no button. Other panes do not change, and the button never shows for a person with no Firstmate. The app tests all of this with one shell command, until a pane passes, and then once for each pane in a session. The app keeps Bearings data in memory for the session only.

The app runs these Firstmate commands only after a tap on Bearings, over the SSH connection that is already open. It installs nothing, and the commands run as the user Herdhand logs in as:

- `bin/fm-bearings-snapshot.sh --json --all-decisions --all-landed`, when Bearings opens and every 30 seconds while it shows, and on a pull down. While the file `state/.afk` exists (away mode), the app runs nothing and shows an away line.
- `bin/fm-tasks-axi.sh show <task id> --full`, when an item opens.
- `bin/fm-inbox.sh note --request-id <id> -- <note>`, when you send Discuss or an action. The note holds the section and the item id, never the item's text.

## Supported agents

The chat view reads the agent's own session file. Herdr gives the app the session, so the agent needs its [Herdr integration](https://github.com/herdrdev/herdr) (`herdr integration install <agent>`). Without a chat, the pane opens on its screen.

| Agent | Chat view | Answer options | Verified working |
|---|---|---|---|
| Claude Code | Herdr App and Herdr TUI | Buttons for a question | Yes |
| Codex | Herdr TUI | No; the screen card shows the question | From samples, not verified on a device |
| GitHub Copilot CLI | Herdr TUI | No; the screen card shows the question | From samples, not verified on a device |
| Pi and OMP | Herdr TUI | No; they have no question tool | From samples, not verified on a device |

"Answer options" is whether the chat shows a question's choices as buttons. The buttons send the keys of Claude Code's question dialog, so other agents wait for a keys check on a device. "From samples" means the reader was built and tested on public sample files and the agent's published format, not on a real session. Herdr App gives the app only a process, so only Claude Code opens as a chat there.

## How it connects

1. You add a machine with its address, SSH port, user name and password, or you [pair it with a code](#pair-with-a-code).
2. On the first connection with a password, the app shows the machine's SHA-256 host key fingerprint. Compare it with the machine's own (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`), then tap **Trust and connect**. A pairing code carries the host keys, so the app checks them for you. The app pins that key; a different key later blocks the connection.
3. The app logs in with the password or the phone key and runs Herdr's own bridge as a plain command: `hc connect` for Herdr App, or `herdr remote-api-bridge` for Herdr TUI. The bridge speaks JSON over the SSH channel. A second channel of the same connection runs Herdr's event subscription, which is how the app learns of changes.

Herdhand installs nothing on the machine. Pairing leaves one line there: the phone's public key in `~/.ssh/authorized_keys`. The password and the host key stay in Android's secure storage, and the phone key stays in the Android Keystore. Herdhand has no server and sends no data anywhere else; see the [privacy policy](PRIVACY.md).

### Pair with a code

1. In Herdhand, tap **Add machine** and type the machine's address, as the phone reaches it. Keep **Pair with a code**, then read the command the app shows.
2. On the machine, open this README in a browser, copy the command below and run it in a terminal, as the user Herdhand logs in as:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/pulseczar-com/herdhand/main/scripts/pair.sh | sh
   ```

   The phone shows the same command, for reference only.

3. Tap **Scan pairing code**, scan the code the script shows, check the details, and tap **Pair and connect**. The terminal prints `Paired:` and the name of the phone key.

The machine must run OpenSSH (`sshd` and `ssh-keygen`); other SSH servers, such as Dropbear, cannot pair. The [script](scripts/pair.sh) needs `sh`, `awk` and `ssh-keygen`, and draws the code itself, so it runs on most Linux systems (BusyBox and Alpine too) and on macOS. It adds a one-time key that can only hand over the phone's public key, works once and expires after 5 minutes. When the phone's key arrives, the script adds it, removes the one-time key and stops. It also removes the one-time key on Ctrl-C or when time runs out. The code lets one phone log in, so show it only where you would type a password.

The phone must still reach the machine over the network. The address you type before the scan stays, so the code cannot replace it with one the phone cannot reach. The name works the same way. A code fills them only when they are empty.

### Lost your phone?

Remove its key from the machine. Each phone key ends with its name, such as `herdhand-Pixel-8-2026-11-07`; **Settings** in the app shows it. Delete the line that ends with that name from `~/.ssh/authorized_keys`.

## What you need

On the machine:

- Herdr App (`hc` on the `PATH` or in `~/.local/bin`), Herdr TUI (`herdr`), or both. With both, you pick one per machine.
- An SSH server that allows password login, or key login to pair with a code.
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

## Known limits

- On Herdr TUI, an agent that starts to wait shows on the next change event or on pull to refresh. Herdr 0.9.3 accepts the agent status event for one pane at a time only.

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
| `src/ssh/` | Opening the bridge and the event stream over SSH, detecting Herdr and reading the machine's files |
| `src/herdr/` | The Herdr App and Herdr TUI clients |
| `src/chat/` | The chat view and the adapter interface that turns an agent's transcript into it |
| `src/claude/`, `src/codex/`, `src/copilot/`, `src/pi/` | One adapter for each agent: where its transcript is, and how its records become chat items |
| `src/machines/` | The saved machines and the open connection |
| `src/bearings/` | The Firstmate bearings: the snapshot and task record readers, the actions and the screens |
| `src/pairing/`, `scripts/pair.sh` | Pairing with a code: the scanner in the app and the script on the machine |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). The Herdhand name and icon are not covered by the license; see [`TRADEMARKS.md`](TRADEMARKS.md).

---

### Built by PulseCzar

We manage our AI coding agents and terminal/SSH sessions with Herdr, so we built Herdhand to make it easy to check on sessions from a phone. Herdhand is free and open source. Herdr is the work of its own maintainers. If you like Herdhand, give [Herdr](https://github.com/herdrdev/herdr) a star.

PulseCzar provides uptime monitoring for websites, APIs and cron jobs. Check it out at [pulseczar.com](https://pulseczar.com/?utm_source=github&utm_medium=readme&utm_campaign=herdhand).

<p align="center">
  <a href="https://pulseczar.com/?utm_source=github&utm_medium=readme&utm_campaign=herdhand">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/pulseczar-bars-dark.png">
      <img src="assets/pulseczar-bars-light.png" alt="PulseCzar uptime monitoring" width="126">
    </picture>
  </a>
</p>
