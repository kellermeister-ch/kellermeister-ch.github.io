import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, rmSync, mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';

const helpersDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(helpersDir, '..', '..');

/** Port the self-started e2e Pod listens on (distinct from a dev Pod on 3000). */
export const POD_PORT = Number(process.env.E2E_POD_PORT ?? 3001);
/** Origin of the e2e Pod. Overridable, but defaults to the 3001 instance. */
export const POD_ORIGIN = (process.env.E2E_POD_ORIGIN ?? `http://localhost:${POD_PORT}`).replace(/\/$/, '');

const CONTAINER = 'css-e2e';
const IMAGE = 'solidproject/community-server:7.2.0';

const dataSrc = join(repoRoot, 'community-solid-server', '.volumes', 'data');
const configDir = join(repoRoot, 'community-solid-server', 'config');
const podData = join(repoRoot, 'e2e', '.pod-data');

// Inbox order fixtures: kept out of the committed Pod seed and copied into the
// throwaway Pod inbox container before each run, so the seed stays free of
// test-only data. Each `<name>.ttl` becomes the Pod resource `<name>` (CSS's
// suffix identifier strategy stores it on disk as `<name>$.ttl`, matching the
// rest of the seed).
const inboxFixturesDir = join(repoRoot, 'e2e', 'fixtures', 'inbox');
const inboxContainerDir = join(podData, 'edwin', 'inbox', 'kellermeister');

// The committed seed is served on localhost:3000; we rewrite a copy to POD_ORIGIN's host:port.
const SRC_HOSTPORT = 'localhost:3000';
const targetHostPort = POD_ORIGIN.replace(/^https?:\/\//, '');
const encode = (hp: string) => hp.replace(':', '%3A');

/** Recursively list every file (not directory) under `dir`. */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Build a gitignored throwaway copy of the seed with its localhost:3000
 * identifiers (resource content and URL-encoded internal index filenames)
 * rewritten to the e2e Pod's host:port, so WebID / OIDC issuer / resource URIs
 * are internally consistent. The committed seed is never touched.
 */
// Transient CSS runtime state (gitignored) that a fresh Pod regenerates: OIDC
// adapter tokens/sessions/clients, login cookies, resource locks. Excluding it
// keeps the copy stable even while a dev Pod is actively churning these, and
// gives each run clean sessions. The account data (accounts/) and signing keys
// (idp/keys) — which login needs — are kept.
const EXCLUDE_FRAGMENTS = ['/.internal/idp/adapter', '/.internal/accounts/cookies', '/.internal/locks'];

/**
 * Copy every `e2e/fixtures/inbox/*.ttl` into the throwaway Pod's inbox container
 * as a CSS resource (`<name>$.ttl`). Runs after the seed copy and before the
 * host-rewrite pass; fixtures carry only synthetic foreign identifiers (no
 * localhost host), so the rewrite leaves them untouched. Creates the container
 * directory if the seed did not ship it (git does not track empty directories).
 */
function seedInboxFixtures(): void {
  if (!existsSync(inboxFixturesDir)) {
    return;
  }
  mkdirSync(inboxContainerDir, { recursive: true });
  for (const fixture of readdirSync(inboxFixturesDir)) {
    if (!fixture.endsWith('.ttl')) {
      continue;
    }
    const resourceFile = `${basename(fixture, '.ttl')}$.ttl`;
    copyFileSync(join(inboxFixturesDir, fixture), join(inboxContainerDir, resourceFile));
  }
}

export function prepareData(): void {
  rmSync(podData, { recursive: true, force: true });
  cpSync(dataSrc, podData, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(dataSrc.length);
      return !EXCLUDE_FRAGMENTS.some((frag) => rel.includes(frag));
    },
  });

  seedInboxFixtures();

  // 1. Rewrite file contents (both plain and URL-encoded host:port forms).
  for (const file of walkFiles(podData)) {
    const original = readFileSync(file, 'utf8');
    const rewritten = original
      .split(SRC_HOSTPORT).join(targetHostPort)
      .split(encode(SRC_HOSTPORT)).join(encode(targetHostPort));
    if (rewritten !== original) writeFileSync(file, rewritten);
  }

  // 2. Rename files whose names encode the source host:port (the pod-baseUrl and
  //    webIdLink/webId account indexes, e.g. ...localhost%3A3000%2F...$.json).
  for (const file of walkFiles(podData)) {
    const name = basename(file);
    if (name.includes(encode(SRC_HOSTPORT))) {
      const renamed = join(dirname(file), name.split(encode(SRC_HOSTPORT)).join(encode(targetHostPort)));
      renameSync(file, renamed);
    }
  }

  // 3. Fail loudly if any source reference survived — a missed one silently
  //    breaks login or the cellar→bottle links.
  const leftovers = walkFiles(podData).filter((file) => {
    if (basename(file).includes(encode(SRC_HOSTPORT))) return true;
    const content = readFileSync(file, 'utf8');
    return content.includes(SRC_HOSTPORT) || content.includes(encode(SRC_HOSTPORT));
  });
  if (leftovers.length > 0) {
    throw new Error(
      `prepareData: ${leftovers.length} file(s) still reference ${SRC_HOSTPORT} after rewrite, e.g. ${leftovers[0]}`,
    );
  }
}

function docker(args: string[], opts: { ignoreErrors?: boolean } = {}): void {
  try {
    execFileSync('docker', args, { stdio: 'pipe' });
  } catch (err) {
    if (!opts.ignoreErrors) throw err;
  }
}

/** Start a fresh CSS container on POD_PORT serving the rewritten copy. */
export function startPod(): void {
  docker(['rm', '-f', CONTAINER], { ignoreErrors: true });
  docker([
    'run', '-d', '--name', CONTAINER,
    '-p', `${POD_PORT}:${POD_PORT}`,
    '-v', `${podData}:/data`,
    '-v', `${configDir}:/config`,
    IMAGE,
    '-c', '/config/kellermeister.json',
    '-b', `${POD_ORIGIN}/`,
    '-p', String(POD_PORT),
    '-f', '/data',
  ]);
}

/** Poll the seeded WebID document until the Pod answers 200 (or time out). */
export async function waitForPod(timeoutMs = 60_000): Promise<void> {
  const url = `${POD_ORIGIN}/edwin/profile/card`;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`waitForPod: ${url} not ready within ${timeoutMs}ms (last: ${String(lastError)})`);
}

/** Stop the container and delete the throwaway copy. Best-effort. */
export function stopPod(): void {
  docker(['rm', '-f', CONTAINER], { ignoreErrors: true });
  rmSync(podData, { recursive: true, force: true });
}

/** An account created on the e2e Pod at run time (see {@link createAccount}). */
export interface PodAccount {
  name: string;
  email: string;
  password: string;
  webId: string;
}

/**
 * Create a fresh account with its own Pod (`${POD_ORIGIN}/<name>/`) through the
 * Community Solid Server's account API. The e2e Pod is a throwaway copy, so
 * tests that need a second identity create one instead of depending on extra
 * credentials for a seeded account.
 */
export async function createAccount(name: string): Promise<PodAccount> {
  const email = `${name}@e2e.test`;
  const password = `${name}-password`;
  const account = await postJson(`${POD_ORIGIN}/.account/account/`, {});
  const authorization = `CSS-Account-Token ${account.authorization}`;
  const index = await (await fetch(`${POD_ORIGIN}/.account/`, { headers: { authorization } })).json();
  await postJson(index.controls.password.create, { email, password }, authorization);
  const pod = await postJson(index.controls.account.pod, { name }, authorization);
  // CSS does not put the storage into a new profile, but the app needs it (as
  // a real provider's profile has it) — add it to the throwaway copy on disk.
  appendFileSync(join(podData, name, 'profile', 'card$.ttl'), `\n<${pod.webId}> <http://www.w3.org/ns/pim/space#storage> <${pod.pod}>.\n`);
  return { name, email, password, webId: pod.webId };
}

async function postJson(url: string, body: unknown, authorization?: string): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/** On-disk directory of a Pod's Kellermeister collection in the throwaway copy. */
export function podCollectionDir(podName: string, collection: string): string {
  return join(podData, podName, 'private', 'kellermeister', 'v1', collection);
}
