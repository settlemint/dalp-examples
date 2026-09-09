/**
 * Which platform line the sandbox runs.
 *
 * `transfer-simulate` arrived with DALP 3.2 and flows 6 and 7 are built on it.
 * The platform publishes no version route, and the client is a proxy that
 * answers for any property name, so nothing can be probed. The line is
 * therefore declared in the environment, and the two flows that need 3.2 say so
 * and stop rather than fail.
 *
 * Setting this to 3.2 is not on its own enough: the pinned SDK, 3.1.19, carries
 * a contract with no transfer-simulate procedure, so the call is refused by the
 * client before a request is made. Running flows 6 and 7 needs both a 3.2
 * sandbox and the SDK moved to the 3.2 line.
 */

const LINE = process.env.DALP_PLATFORM_LINE ?? "3.1";

/** True when DALP_PLATFORM_LINE names 3.2 or later. */
export function hasTransferSimulate(): boolean {
  const [major = "0", minor = "0"] = LINE.split(".");
  return Number(major) > 3 || (Number(major) === 3 && Number(minor) >= 2);
}

/** Print the notice and carry on, for a flow that cannot run on this line. */
export function skipUnless32(flow: string): void {
  console.log(`\n  ${flow} needs DALP 3.2 for transfer-simulate; DALP_PLATFORM_LINE is ${LINE}.`);
  console.log(
    "  Move the sandbox and the @settlemint/dalp-sdk pin to 3.2, set DALP_PLATFORM_LINE=3.2, and run it again.",
  );
}
