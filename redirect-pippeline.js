import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import url from "url";
import { execSync, spawnSync } from "child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** CONFIG BÁSICA **/
const TEMPLATE_DIR = "/Users/ramiroatlantic/Desktop/redirect"; // tu carpeta base
const VERCEL_TARGETS = ["production", "preview", "development"];

/** Funciones auxiliares **/
function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    const out = execSync(cmd, { stdio: "pipe", encoding: "utf-8", ...opts });
    if (out?.trim()) console.log(out.trim());
    return out;
  } catch (e) {
    console.error(e.stdout || e.message);
    process.exit(1);
  }
}

async function ensureDirNotExists(dir) {
  if (fs.existsSync(dir)) {
    console.error(`❌ Ya existe la carpeta: ${dir}`);
    process.exit(1);
  }
}

async function copyTemplate(toDir) {
  fs.cpSync(TEMPLATE_DIR, toDir, { recursive: true });
  const gitDir = path.join(toDir, ".git");
  if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });
}

async function writeEnvFile(projectDir, envMap) {
  const envPath = path.join(projectDir, ".env.local");
  const lines = Object.entries(envMap).map(([k, v]) => `${k}=${v}`);
  await fsp.writeFile(envPath, lines.join("\n"), "utf-8");
  console.log(`📝 Generado ${path.relative(process.cwd(), envPath)}`);
}

function addGitHubRepo(projectDir, name) {
  run(`git init`, { cwd: projectDir });
  run(`git add .`, { cwd: projectDir });
  run(`git commit -m "Initial commit"`, { cwd: projectDir });
  run(`gh repo create ${name} --public --source . --remote origin --push`, { cwd: projectDir });
}

function vercelLink(projectDir, name) {
  run(`vercel link --project ${name} --yes`, { cwd: projectDir });
}

function vercelEnvAddAll(projectDir, key, value) {
  for (const target of VERCEL_TARGETS) {
    console.log(`\n$ vercel env add ${key} ${target}`);
    const result = spawnSync(
      "vercel",
      ["env", "add", key, target],
      {
        cwd: projectDir,
        input: value + "\n",   // envía el valor automáticamente
        stdio: "inherit",
        shell: true
      }
    );

    if (result.status !== 0) {
      console.error(`❌ Falló al agregar la variable de entorno ${key} en Vercel (${target})`);
      process.exit(1);
    }
  }
}

function vercelDeploy(projectDir) {
  const out = run(`vercel --prod --confirm`, { cwd: projectDir });
  const urlMatch = out.match(/https?:\/\/[^\s]+\.vercel\.app/gi);
  const url = urlMatch ? urlMatch[urlMatch.length - 1] : null;
  return url;
}

/** SCRIPT PRINCIPAL **/
async function main() {
  const [,, projectName, apiNumber] = process.argv;

  if (!projectName || !apiNumber) {
    console.log("Uso:");
    console.log("  node bootstrap.mjs <nombre-proyecto> <NEXT_PUBLIC_API_NUMBER>");
    process.exit(1);
  }

  const projectDir = path.resolve(`/Users/ramiroatlantic/Desktop/${projectName}`);

  await ensureDirNotExists(projectDir);
  await copyTemplate(projectDir);
  await writeEnvFile(projectDir, { NEXT_PUBLIC_API_NUMBER: apiNumber });

  addGitHubRepo(projectDir, projectName);
  vercelLink(projectDir, projectName);
  vercelEnvAddAll(projectDir, "NEXT_PUBLIC_API_NUMBER", apiNumber);

  const url = vercelDeploy(projectDir);

  console.log("\n✅ Proyecto listo");
  console.log(`🔗 URL prod: ${url}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
