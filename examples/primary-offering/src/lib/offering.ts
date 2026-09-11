/**
 * Which offering the nine flows are working on.
 *
 * These are your own records, not the platform's: the symbol you listed under,
 * the addresses your onboarding team holds, and the size your allocation engine
 * approved. DALP is never asked for them. Everything else each flow needs, it
 * reads back from the platform, so the flows can be run in any order, re-run
 * after a failure, and run against an offering someone else created.
 *
 * Override any of them from the environment to work on a second offering.
 */

/** The ticker the offering is listed under. One symbol is one instrument. */
export const SYMBOL = process.env.POF_SYMBOL ?? "POCA";

/** The issuer listing the instrument. */
export const ISSUER_EMAIL = process.env.POF_ISSUER ?? "issuer@primary-offering.example";

/** The investors the offering is sold to. */
export const INVESTOR_EMAILS: readonly string[] = (
  process.env.POF_INVESTORS ?? "alice@primary-offering.example,bob@primary-offering.example"
)
  .split(",")
  .map((email) => email.trim())
  .filter((email) => email !== "");

/** The units your allocation engine approved for each investor. */
export const ALLOCATED_UNITS = "1000";

/** The size of the offering, the ceiling the compliance module enforces. */
export const OFFERING_SIZE = "1000000";

/** The price every order is quoted against. */
export const PRICE = "100.00";
export const CURRENCY = "AED";

/** ISO 3166-1 alpha-2, the jurisdiction identities are registered under. */
export const COUNTRY = "AE";

/** The two verdicts the token's compliance rule requires at mint time. */
export const REQUIRED_TOPICS = ["knowYourCustomer", "antiMoneyLaundering"] as const;
