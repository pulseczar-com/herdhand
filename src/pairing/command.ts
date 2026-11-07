const SCRIPT_URL = "https://raw.githubusercontent.com/pulseczar-com/herdhand/v{version}/scripts/pair.sh";

/**
 * The command the person runs on the machine to show a pairing code. It fetches the script of
 * this app's release, so the code it shows is one this app reads.
 */
export function makePairCommand(appVersion: string): string {
  return `curl -fsSL ${SCRIPT_URL.replace("{version}", appVersion)} | sh`;
}
