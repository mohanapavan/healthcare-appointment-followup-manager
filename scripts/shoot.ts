/**
 * scripts/shoot.ts — screenshot every route as each seeded role, at desktop
 * (1440) and mobile (390), into docs/screens/. This is the §8 feedback loop:
 * generate, then OPEN THE PNGS AND LOOK. Run with the dev server up:
 *
 *   npm run shoot                      # all roles, both widths
 *   npm run shoot -- public patient    # only these groups
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SHOOT_BASE_URL ?? "http://localhost:3000";
const OUT = join(process.cwd(), "docs", "screens");
const WIDTHS = { desktop: 1440, mobile: 390 } as const;
const HEIGHTS = { desktop: 900, mobile: 844 } as const;

const CREDS = {
  patient: { email: "patient1@clinic.test", password: "Patient123!", home: "/patient" },
  doctor: { email: "dr.nair@clinic.test", password: "Doctor123!", home: "/doctor" },
  admin: { email: "admin@clinic.test", password: "Admin123!", home: "/admin" },
} as const;

type Group = "public" | "patient" | "doctor" | "admin";

async function shootRoute(page: Page, path: string, name: string) {
  for (const device of ["desktop", "mobile"] as const) {
    await page.setViewportSize({ width: WIDTHS[device], height: HEIGHTS[device] });
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30_000 });
    } catch {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    // Wait out client-side fetches: skeletons gone, then settle motion.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForFunction(() => !document.querySelector(".skeleton"), { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${name}.${device}.png`), fullPage: true });
    console.log(`  ✓ ${name}.${device}.png  (${path})`);
  }
}

async function login(page: Page, role: keyof typeof CREDS) {
  const c = CREDS[role];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", c.email);
  await page.fill("#password", c.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function firstLinkHref(page: Page, path: string, selector: string): Promise<string | null> {
  try {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    return await page.locator(selector).first().getAttribute("href", { timeout: 5_000 });
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const groups = (process.argv.slice(2).filter((a) => !a.startsWith("-")) as Group[]);
  const run = (g: Group) => groups.length === 0 || groups.includes(g);

  const browser: Browser = await chromium.launch();
  const guard = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.error(`  ✗ ${label} group failed:`, (e as Error).message);
    }
  };

  if (run("public"))
    await guard("public", async () => {
      console.log("public");
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await shootRoute(page, "/", "public-landing");
      await shootRoute(page, "/login", "public-login");
      await shootRoute(page, "/register", "public-register");
      await ctx.close();
    });

  if (run("patient"))
    await guard("patient", async () => {
      console.log("patient");
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, "patient");
      await shootRoute(page, "/patient", "patient-find");
      await shootRoute(page, "/patient/appointments", "patient-appointments");
      const bookHref = await firstLinkHref(page, "/patient", 'a[href^="/patient/book/"]');
      if (bookHref) await shootRoute(page, bookHref, "patient-book");
      await ctx.close();
    });

  if (run("doctor"))
    await guard("doctor", async () => {
      console.log("doctor");
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, "doctor");
      await shootRoute(page, "/doctor", "doctor-today");
      await shootRoute(page, "/doctor/leave", "doctor-leave");
      const apptHref = await firstLinkHref(page, "/doctor", 'a[href^="/doctor/appointments/"]');
      if (apptHref) await shootRoute(page, apptHref, "doctor-appointment");
      await ctx.close();
    });

  if (run("admin"))
    await guard("admin", async () => {
      console.log("admin");
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, "admin");
      await shootRoute(page, "/admin", "admin-doctors");
      await shootRoute(page, "/admin/outbox", "admin-outbox");
      await ctx.close();
    });

  await browser.close();
  console.log(`\nDone → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
