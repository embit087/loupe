// Prepare the exact JPEG bytes used by the visual search endpoint, once per post.
import { readFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const project = path.resolve(import.meta.dirname, "..");
const archive = path.resolve(process.env.COLLECTIONS_SOURCE_ROOT || path.join(project, "..", "sample-archive"));
const category = process.argv[process.argv.indexOf("--category") + 1];
const categories = category === "design" || category === "kol" ? [category] : ["design", "kol"];
const jobs = [];

for (const group of categories) {
  const file = group === "design" ? "atlas.json" : "kol.json";
  const { posts } = JSON.parse(await readFile(path.join(project, "content", file), "utf8"));
  for (const post of posts) {
    const source = post.kind === "video"
      ? path.join(archive, "instagram-data", "first-frames", post.author, `${post.asset}.jpg`)
      : path.join(archive, post.posterPath);
    const target = path.join(archive, "instagram-data", "visual-inputs", post.author, `${post.asset}.jpg`);
    jobs.push({ source, fallback: post.kind === "video" ? path.join(archive, post.posterPath) : null, target });
  }
}

let cursor = 0;
let built = 0;
let posterFallbacks = 0;
const errors = [];
async function worker() {
  while (cursor < jobs.length) {
    const { source, fallback, target } = jobs[cursor++];
    try {
      let actualSource = source;
      let input = await stat(source).catch(() => null);
      if (!input && fallback) {
        actualSource = fallback;
        input = await stat(fallback);
        posterFallbacks++;
      }
      if (!input) throw new Error("Source image is missing");
      await mkdir(path.dirname(target), { recursive: true });
      const bytes = await sharp(actualSource).rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 74 }).toBuffer();
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, target);
      built++;
    } catch (error) {
      errors.push(`${target}: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, () => worker()));
console.log(`Visual inputs: ${jobs.length} posts, ${built} prepared, ${posterFallbacks} video poster fallbacks, ${errors.length} errors`);
if (errors.length) {
  console.error(errors.slice(0, 20).join("\n"));
  process.exitCode = 1;
}
