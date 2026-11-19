import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";
import { getLeadSettings, updateLeadSettings } from "./leads.repository";

const execFileAsync = promisify(execFile);

export const SEARXNG_CONTAINER_NAME = "surface-searxng";
export const SEARXNG_LOCAL_URL = "http://127.0.0.1:8080";
const LOCAL_IMAGE = "surface-searxng:latest";
const FALLBACK_IMAGE =
  process.env.SEARXNG_DOCKER_IMAGE?.trim() ||
  "prajwalreddy17/surface-searxng:latest";
const CACHE_VOLUME = "surface-searxng-cache";
const COMPOSE_PATH = join(env.DATA_DIR, "searxng-docker-compose.yaml");
const START_TIMEOUT_MS = 180_000;
const READY_TIMEOUT_MS = 45_000;

const dockerCandidates = [
  process.env.SURFACE_DOCKER_BIN?.trim(),
  "docker",
  "/usr/bin/docker",
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
].filter((value): value is string => Boolean(value));

let resolvedDockerBinary: string | null = null;
let composeAvailable: boolean | null = null;

export type SearxngDockerState =
  | "docker-unavailable"
  | "not-created"
  | "running"
  | "stopped"
  | "paused"
  | "restarting"
  | "exited"
  | "unknown";

export type SearxngDockerStatus = {
  dockerAvailable: boolean;
  dockerVersion: string | null;
  containerName: string;
  state: SearxngDockerState;
  health: string | null;
  exists: boolean;
  running: boolean;
  url: string;
  image: string | null;
  error: string | null;
};

type DockerResult = {
  stdout: string;
  stderr: string;
};

function cleanOutput(value: string | Buffer | undefined) {
  return (value?.toString() ?? "").trim();
}

async function runDocker(
  args: string[],
  options: { timeout?: number } = {},
): Promise<DockerResult> {
  if (!resolvedDockerBinary) {
    throw new HttpError(
      503,
      "Docker was not found. Install Docker or start SearXNG manually.",
    );
  }
  try {
    const result = await execFileAsync(resolvedDockerBinary, args, {
      timeout: options.timeout ?? 20_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      stdout: cleanOutput(result.stdout),
      stderr: cleanOutput(result.stderr),
    };
  } catch (error) {
    const failure = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
      code?: string | number;
    };
    const detail =
      cleanOutput(failure.stderr) ||
      cleanOutput(failure.stdout) ||
      failure.message ||
      "Docker command failed.";
    throw new HttpError(503, detail.slice(0, 800));
  }
}

async function findDocker() {
  if (resolvedDockerBinary) return true;
  for (const candidate of dockerCandidates) {
    try {
      const result = await execFileAsync(candidate, ["--version"], {
        timeout: 3_000,
        windowsHide: true,
      });
      // The client binary can exist while the daemon is down; check the
      // daemon separately so a stopped Docker Desktop gets a clear message.
      if (cleanOutput(result.stdout)) {
        resolvedDockerBinary = candidate;
        return true;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return false;
}

async function dockerVersion() {
  if (!resolvedDockerBinary) return null;
  try {
    const result = await runDocker(
      ["version", "--format", "{{.Server.Version}}"],
      {
        timeout: 5_000,
      },
    );
    return result.stdout || null;
  } catch {
    return null;
  }
}

async function inspectContainer() {
  try {
    const result = await runDocker([
      "inspect",
      "--format",
      "{{json .State}}|{{.Config.Image}}",
      SEARXNG_CONTAINER_NAME,
    ]);
    const [stateJson, image] = result.stdout.split("|");
    const state = JSON.parse(stateJson ?? "{}") as {
      Status?: string;
      Running?: boolean;
      Paused?: boolean;
      Restarting?: boolean;
      Health?: { Status?: string };
    };
    return {
      exists: true,
      state,
      image: image?.trim() || null,
    };
  } catch {
    return { exists: false, state: null, image: null };
  }
}

function mapState(
  state: {
    Status?: string;
    Running?: boolean;
    Paused?: boolean;
    Restarting?: boolean;
  } | null,
): SearxngDockerState {
  if (!state) return "not-created";
  if (state.Paused) return "paused";
  if (state.Restarting) return "restarting";
  if (state.Running) return "running";
  switch (state.Status) {
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "restarting":
      return "restarting";
    case "exited":
      return "exited";
    case "created":
    case "dead":
      return "stopped";
    default:
      return "unknown";
  }
}

export async function getSearxngDockerStatus(): Promise<SearxngDockerStatus> {
  const available = await findDocker();
  if (!available) {
    return {
      dockerAvailable: false,
      dockerVersion: null,
      containerName: SEARXNG_CONTAINER_NAME,
      state: "docker-unavailable",
      health: null,
      exists: false,
      running: false,
      url: SEARXNG_LOCAL_URL,
      image: null,
      error:
        "Docker is not installed or its daemon is not running. Install Docker Desktop/Engine, or keep using an external SearXNG instance.",
    };
  }
  const version = await dockerVersion();
  if (!version) {
    return {
      dockerAvailable: false,
      dockerVersion: null,
      containerName: SEARXNG_CONTAINER_NAME,
      state: "docker-unavailable",
      health: null,
      exists: false,
      running: false,
      url: SEARXNG_LOCAL_URL,
      image: null,
      error:
        "Docker is installed but the daemon is not reachable. Start Docker and try again.",
    };
  }
  const container = await inspectContainer();
  const state = mapState(container.state);
  return {
    dockerAvailable: true,
    dockerVersion: version,
    containerName: SEARXNG_CONTAINER_NAME,
    state,
    health: container.state?.Health?.Status ?? null,
    exists: container.exists,
    running: state === "running",
    url: SEARXNG_LOCAL_URL,
    image: container.image,
    error: null,
  };
}

async function searxngSecret() {
  const path = join(env.DATA_DIR, "searxng-docker-secret");
  try {
    const value = (await readFile(path, "utf8")).trim();
    if (value.length >= 32) return value;
  } catch {
    // Generate a new secret below.
  }
  const secret = randomBytes(32).toString("hex");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, secret, { mode: 0o600 });
  return secret;
}

async function resolveImage() {
  for (const image of [LOCAL_IMAGE, FALLBACK_IMAGE]) {
    try {
      await runDocker(["image", "inspect", image], { timeout: 8_000 });
      return image;
    } catch {
      // Try the next image; docker run can pull the fallback.
    }
  }
  return FALLBACK_IMAGE;
}

async function isReady() {
  try {
    const response = await fetch(
      `${SEARXNG_LOCAL_URL}/search?q=surface&format=json`,
      { signal: AbortSignal.timeout(2_500) },
    );
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return (
      typeof body === "object" &&
      body !== null &&
      Array.isArray((body as { results?: unknown }).results)
    );
  } catch {
    return false;
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

async function saveLocalSearchUrl() {
  const settings = await getLeadSettings();
  await updateLeadSettings({
    searxngUrl: SEARXNG_LOCAL_URL,
    productContext: settings.productContext,
  });
}

async function hasDockerCompose() {
  if (composeAvailable !== null) return composeAvailable;
  try {
    await runDocker(["compose", "version"], { timeout: 8_000 });
    composeAvailable = true;
  } catch {
    composeAvailable = false;
  }
  return composeAvailable;
}

async function ensureComposeFile(image: string, secret: string) {
  const compose = `name: surface-searxng

services:
  searxng:
    image: "${image}"
    container_name: surface-searxng
    restart: unless-stopped
    environment:
      SEARXNG_SECRET: "${secret}"
      SEARXNG_BASE_URL: "http://127.0.0.1:8080/"
      SEARXNG_LIMITER: "false"
      SEARXNG_IMAGE_PROXY: "false"
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - searxng-cache:/var/cache/searxng

volumes:
  searxng-cache:
    name: ${CACHE_VOLUME}
`;
  await mkdir(dirname(COMPOSE_PATH), { recursive: true, mode: 0o700 });
  await writeFile(COMPOSE_PATH, compose, { mode: 0o600 });
}

export async function startSearxngDocker(): Promise<SearxngDockerStatus> {
  const status = await getSearxngDockerStatus();
  if (!status.dockerAvailable) {
    throw new HttpError(503, status.error ?? "Docker is not available.");
  }

  if (status.exists) {
    if (status.state === "paused") {
      await runDocker(["unpause", SEARXNG_CONTAINER_NAME], {
        timeout: START_TIMEOUT_MS,
      });
    } else if (!status.running && status.state !== "restarting") {
      await runDocker(["start", SEARXNG_CONTAINER_NAME], {
        timeout: START_TIMEOUT_MS,
      });
    }
  } else {
    const image = await resolveImage();
    const secret = await searxngSecret();
    if (await hasDockerCompose()) {
      await ensureComposeFile(image, secret);
      await runDocker(
        ["compose", "-p", "surface-searxng", "-f", COMPOSE_PATH, "up", "-d"],
        { timeout: START_TIMEOUT_MS },
      );
    } else {
      await runDocker(
        [
          "run",
          "-d",
          "--name",
          SEARXNG_CONTAINER_NAME,
          "--restart",
          "unless-stopped",
          "-p",
          "127.0.0.1:8080:8080",
          "--mount",
          `type=volume,src=${CACHE_VOLUME},dst=/var/cache/searxng`,
          "-e",
          "SEARXNG_BASE_URL=http://127.0.0.1:8080/",
          "-e",
          "SEARXNG_LIMITER=false",
          "-e",
          "SEARXNG_IMAGE_PROXY=false",
          "-e",
          `SEARXNG_SECRET=${secret}`,
          image,
        ],
        { timeout: START_TIMEOUT_MS },
      );
    }
  }

  if (!(await waitUntilReady())) {
    let logs = "";
    try {
      const result = await runDocker([
        "logs",
        "--tail",
        "40",
        SEARXNG_CONTAINER_NAME,
      ]);
      logs = result.stderr || result.stdout;
    } catch {
      // Keep the generic timeout message.
    }
    throw new HttpError(
      503,
      `SearXNG did not become ready.${logs ? ` Recent container output: ${logs.slice(0, 1200)}` : " Check the container logs and Docker port 8080."}`,
    );
  }

  await saveLocalSearchUrl();
  return getSearxngDockerStatus();
}

export async function stopSearxngDocker(): Promise<SearxngDockerStatus> {
  const status = await getSearxngDockerStatus();
  if (!status.dockerAvailable) {
    throw new HttpError(503, status.error ?? "Docker is not available.");
  }
  if (status.exists) {
    try {
      await runDocker(["stop", "-t", "10", SEARXNG_CONTAINER_NAME], {
        timeout: 30_000,
      });
    } catch (error) {
      if (
        !(error instanceof HttpError) ||
        !/no such container/i.test(error.message)
      ) {
        throw error;
      }
    }
  }
  return getSearxngDockerStatus();
}
