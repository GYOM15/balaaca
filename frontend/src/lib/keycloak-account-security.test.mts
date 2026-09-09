import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * What guards a provider's account, and the one place it can be written.
 *
 * <p>None of this existed. A provider could register with a ONE-CHARACTER
 * password, and an attacker had unlimited attempts against the token endpoint
 * with no delay and no lockout: Keycloak sets no password policy and leaves
 * `bruteForceProtected` false on a new realm, and neither key appeared anywhere
 * in this repository. The two compound - no floor on the secret, no ceiling on
 * the guesses.
 *
 * <p>The trap this file exists to keep shut is WHERE they are written.
 * `--import-realm` leaves an EXISTING realm alone, so anything put in
 * realm-balaaca.json.template takes effect on the first boot of a fresh
 * database and never again. Writing a password policy there would look
 * completely correct in a diff, pass review, ship, and change nothing at all on
 * every deployment already past its first boot. init-realm.sh replays on every
 * boot, which is why the theme, the locale and the SMTP settings were moved
 * there before this.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const KEYCLOAK = join(ROOT, "infrastructure", "keycloak");

const init = readFileSync(join(KEYCLOAK, "init-realm.sh"), "utf8");
const template = readFileSync(join(KEYCLOAK, "realm-balaaca.json.template"), "utf8");
const compose = readFileSync(join(ROOT, "docker-compose.yml"), "utf8");
const generate = readFileSync(join(ROOT, "scripts", "generate-env.sh"), "utf8");
const example = readFileSync(join(ROOT, ".env.example"), "utf8");

test("a password has a floor, and it is not the account's own name", () => {
  assert.match(init, /-s 'passwordPolicy=[^']*length\(8\)/);
  assert.match(init, /-s 'passwordPolicy=[^']*notUsername/);
  assert.match(init, /-s 'passwordPolicy=[^']*notEmail/);
});

test("guessing is bounded, and the lockout is never permanent", () => {
  assert.match(init, /-s bruteForceProtected=true/);
  assert.match(init, /-s failureFactor=\d+/);
  assert.match(init, /-s maxFailureWaitSeconds=\d+/);
  // A permanent lockout is a denial of service anybody can aim at any provider
  // by guessing their address five times, and there is no support desk to
  // unlock them again.
  assert.match(init, /-s permanentLockout=false/);
});

test("neither is written where Keycloak would never read it again", () => {
  // The whole point. In the template these are applied once, on the first boot
  // of an empty database, and never on any deployment that already imported the
  // realm - silently, with a diff that looks right.
  for (const key of ["passwordPolicy", "bruteForceProtected", "failureFactor"]) {
    assert.ok(
      !template.includes(key),
      `${key} is in the realm template, where --import-realm will ignore it on every existing deployment`,
    );
  }
});

test("the public password-grant client is off unless something asks for it", () => {
  // balaaca-dev-cli is a PUBLIC client with directAccessGrantsEnabled. Its own
  // description claims a production realm does not carry it, and that was never
  // true: docker-compose.prod.yml imports this same template.
  assert.match(template, /"clientId": "balaaca-dev-cli"/);
  assert.match(template, /"directAccessGrantsEnabled": true/);

  // So the script decides, and a MISSING variable must disable it. Every
  // default in the chain points the same way; the one that matters is the
  // script's, because it is the last one read.
  assert.match(init, /KEYCLOAK_DEV_CLIENT_ENABLED:-false/);
  assert.match(init, /balaaca-dev-cli/);
  assert.match(init, /-s enabled=false/);

  assert.match(compose, /KEYCLOAK_DEV_CLIENT_ENABLED: \$\{KEYCLOAK_DEV_CLIENT_ENABLED:-false\}/);
  // A deployment's .env is written by this script, and it writes false.
  assert.match(generate, /KEYCLOAK_DEV_CLIENT_ENABLED=false/);
  // A developer's copy carries true, or the local smoke check cannot sign in.
  assert.match(example, /^KEYCLOAK_DEV_CLIENT_ENABLED=true$/m);
});
