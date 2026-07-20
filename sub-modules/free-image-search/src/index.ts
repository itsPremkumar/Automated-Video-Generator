import axios from "axios";
import fs from "fs-extra";
import path from "path";
import inquirer from "inquirer";
import { program } from "./cli.js";

const DOWNLOAD_DIR = "./downloads";

interface ImageResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  creator: string;
  creator_url: string;
  license: string;
  license_version: string;
  license_url: string;
  provider: string;
  attribution: string;
  height: number;
  width: number;
}

interface OpenverseResponse {
  result_count: number;
  page_count: number;
  page_size: number;
  page: number;
  results: OpenverseImage[];
}

interface OpenverseImage {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  creator: string;
  creator_url: string;
  license: string;
  license_version: string;
  license_url: string;
  provider: string;
  source: string;
  attribution: string;
  height: number;
  width: number;
  filesize: number | null;
  filetype: string | null;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_PAGE_SIZE = 50;

function extFromUrl(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const match = clean.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff?)$/i);
  return match ? `.${match[1].toLowerCase()}` : ".jpg";
}

async function searchOpenverse(
  keyword: string,
  desired: number
): Promise<{ images: ImageResult[]; total: number }> {
  const pageSize = Math.min(desired, MAX_PAGE_SIZE);
  const { data } = await axios.get<OpenverseResponse>(
    "https://api.openverse.engineering/v1/images/",
    {
      params: { q: keyword, page: 1, page_size: pageSize },
      headers: { "User-Agent": UA },
    }
  );

  const results: ImageResult[] = data.results.map((r) => ({
    id: r.id,
    title: r.title || "Untitled",
    url: r.url,
    thumbnail: r.thumbnail,
    creator: r.creator || "Unknown",
    creator_url: r.creator_url || "",
    license: r.license,
    license_version: r.license_version,
    license_url: r.license_url,
    provider: r.provider,
    attribution: r.attribution,
    height: r.height,
    width: r.width,
  }));

  let images = results;

  if (results.length < desired && data.page_count > 1) {
    for (let p = 2; p <= data.page_count && images.length < desired; p++) {
      await sleep(300);
      const { data: nextPage } = await axios.get<OpenverseResponse>(
        "https://api.openverse.engineering/v1/images/",
        {
          params: { q: keyword, page: p, page_size: pageSize },
          headers: { "User-Agent": UA },
        }
      );
      images.push(
        ...nextPage.results.map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          url: r.url,
          thumbnail: r.thumbnail,
          creator: r.creator || "Unknown",
          creator_url: r.creator_url || "",
          license: r.license,
          license_version: r.license_version,
          license_url: r.license_url,
          provider: r.provider,
          attribution: r.attribution,
          height: r.height,
          width: r.width,
        }))
      );
    }
  }

  return { images, total: data.result_count };
}

async function tryDownload(url: string, destPath: string): Promise<boolean> {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 20000,
    headers: {
      "User-Agent": UA,
      Referer: "https://openverse.org/",
    },
    validateStatus: (s) => s === 200,
  });

  const writer = fs.createWriteStream(destPath);
  return new Promise<boolean>((resolve, reject) => {
    writer.on("finish", () => resolve(true));
    writer.on("error", reject);
    response.data.pipe(writer);
    response.data.on("error", () => resolve(false));
  });
}

async function downloadImage(image: ImageResult, destPath: string): Promise<boolean> {
  await fs.ensureDir(path.dirname(destPath));

  const attempts = [
    { label: "direct", url: image.url },
    { label: "thumbnail", url: image.thumbnail },
  ];

  for (const attempt of attempts) {
    try {
      const ok = await tryDownload(attempt.url, destPath);
      if (ok) return true;
    } catch {
      continue;
    }
  }

  return false;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(keyword: string, count: number) {
  console.log(`\nSearching Openverse for "${keyword}" ...\n`);

  const { images, total } = await searchOpenverse(keyword, count);

  if (images.length === 0) {
    console.log("No results found.\n");
    return;
  }

  const selected = images.slice(0, count);
  let ok = 0;

  console.log(`Found ${total} results, downloading ${selected.length}:\n`);

  for (let i = 0; i < selected.length; i++) {
    const img = selected[i];
    const ext = extFromUrl(img.url);
    const safeName = sanitizeFilename(img.title) || `image_${i + 1}`;
    const destPath = path.join(DOWNLOAD_DIR, `${safeName}${ext}`);

    process.stdout.write(`  [${i + 1}/${selected.length}] ${img.title} ... `);

    const success = await downloadImage(img, destPath);
    if (success) {
      console.log("OK");
      ok++;
    } else {
      console.log("FAILED (all sources rejected)");
    }

    await sleep(400);
  }

  const okColor = ok === selected.length ? "" : ` (${ok}/${selected.length} succeeded)`;
  console.log(`\nDone. Files saved to "${DOWNLOAD_DIR}/"${okColor}`);

  if (ok > 0) {
    console.log("\nAttribution info (required for CC licenses):\n");
    for (const img of selected) {
      console.log(`  - ${img.attribution}`);
    }
  }
  console.log();
}

async function interactive() {
  const { keyword } = await inquirer.prompt<{ keyword: string }>([
    {
      type: "input",
      name: "keyword",
      message: "Search for images:",
      validate: (v: string) => v.trim().length > 0 || "Enter a keyword",
    },
  ]);

  const { count } = await inquirer.prompt<{ count: number }>([
    {
      type: "number",
      name: "count",
      message: "How many images to download?",
      default: 5,
      validate: (v: number) => (v > 0 && v <= 50) || "Enter 1–50",
    },
  ]);

  await run(keyword, count);
}

async function main() {
  const args = program();
  if (args.keyword) {
    await run(args.keyword, args.count);
  } else {
    await interactive();
  }
}

main().catch((err) => {
  if (err?.response?.status === 401) {
    console.error("\nOpenverse API rejected the request. This may be a temporary rate limit.");
    console.error("Try again in a few minutes, or use fewer images (-n 5).");
  } else if (err?.response?.status === 429) {
    console.error("\nRate limited by Openverse API. Wait a moment and try again.");
  } else {
    console.error(`\nError: ${err.message}`);
  }
  process.exit(1);
});
