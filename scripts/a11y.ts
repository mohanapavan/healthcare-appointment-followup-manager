/**
 * scripts/a11y.ts — WCAG 2 A/AA audit of every route with axe-core, as each
 * seeded role. Run with the dev server up:  npm run a11y  [public|patient|...]
 */
import { chromium, type Page } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.SHOOT_BASE_URL ?? "http://localhost:3000";

const CREDS = {
  patient: { email: "patient1@clinic.test", password: "Patient123!" },
  doctor: { email: "dr.nair@clinic.test", password: "Doctor123!" },
  admin: { email: "admin@clinic.test", password: "Admin123!" },
} as const;

type Group = "public" | "patient" | "doctor" | "admin";

interface Violation { id: string; impact: string; help: string; nodes: number }

async function audit(page: Page, path: string): Promise<Violation[]> {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector(".skeleton"), { timeout: 8000 }).catch(() => {});
  await page.addScriptTag({ content: AXE });
  const res = (await page.evaluate(async () => {
    // @ts-expect-error injected global
    return await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
  })) as { violations: { id: string; impact: string | null; help: string; nodes: unknown[] }[] };
  return res.violations.map((v) => ({ id: v.id, impact: v.impact ?? "n/a", help: v.help, nodes: v.nodes.length }));
}

async function login(page: Page, role: keyof typeof CREDS) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", CREDS[role].email);
  await page.fill("#password", CREDS[role].password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }).catch(() => {});
}

const ROUTES: Record<Group, string[]> = {
  public: ["/", "/login", "/register"],
  patient: ["/patient", "/patient/appointments"],
  doctor: ["/doctor", "/doctor/leave"],
  admin: ["/admin", "/admin/outbox"],
};

async function main() {
  const groups = process.argv.slice(2).filter((a) => !a.startsWith("-")) as Group[];
  const run = (g: Group) => groups.length === 0 || groups.includes(g);
  const browser = await chromium.launch();
  let total = 0;

  for (const g of Object.keys(ROUTES) as Group[]) {
    if (!run(g)) continue;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    if (g !== "public") await login(page, g as keyof typeof CREDS);
    for (const path of ROUTES[g]) {
      const v = await audit(page, path);
      total += v.length;
      if (v.length === 0) console.log(`✓ ${path} — no WCAG A/AA violations`);
      else {
        console.log(`✗ ${path} — ${v.length} violation type(s):`);
        v.forEach((x) => console.log(`    [${x.impact}] ${x.id} (${x.nodes}) — ${x.help}`));
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${total === 0 ? "PASS" : "FAIL"} — ${total} violation type(s) total`);
  process.exit(total === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
