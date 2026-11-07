const SCRIPT_URL = "https://raw.githubusercontent.com/pulseczar-com/herdhand/{ref}/scripts/pair.sh";

/**
 * The command the person runs on the machine to show a pairing code. It fetches the script of
 * this app's release, so the code it shows is one this app reads.
 */
export function makePairCommand(appVersion: string | null): string {
  const ref = appVersion ? `v${appVersion}` : "main";
  return `curl -fsSL ${SCRIPT_URL.replace("{ref}", ref)} | sh`;
}
