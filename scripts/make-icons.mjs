// Regenerates the Android launcher icons from public/logo.svg.
//
//   bun scripts/make-icons.mjs
//
// Writes, for every mipmap density:
//   ic_launcher.png           legacy icon, white background baked in
//   ic_launcher_round.png     legacy icon, circular crop
//   ic_launcher_foreground.png adaptive layer: logo centred in the 108dp
//                              canvas so it stays in the 72dp safe zone
import fs from "node:fs";
import sharp from "sharp";

const RES = "android/app/src/main/res";
const svg = fs.readFileSync("public/logo.svg");

// mdpi is the baseline: launcher icons are 48dp, adaptive canvases are 108dp.
const DENSITIES = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
];

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** Renders the logo at `size`, flattened onto white. */
async function renderMark(size) {
  return sharp(svg, { density: 600 })
    .resize(size, size, { fit: "contain" })
    .flatten({ background: WHITE })
    .png()
    .toBuffer();
}

/** Square logo cropped to a circle of `size` px. */
async function circleCrop(size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${
      size / 2
    }" r="${size / 2}" fill="#000"/></svg>`,
  );
  const mark = await renderMark(size);
  return sharp(mark)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** Logo centred on a transparent 108dp-proportioned adaptive canvas. */
async function adaptiveForeground(fgSize) {
  const markSize = Math.round(fgSize * (72 / 108)); // 72dp safe zone
  const mark = await sharp(svg, { density: 600 })
    .resize(markSize, markSize, { fit: "contain" })
    .flatten({ background: WHITE })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: fgSize,
      height: fgSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: mark,
        left: Math.round((fgSize - markSize) / 2),
        top: Math.round((fgSize - markSize) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const fills = [...new Set(svg.toString().match(/fill="[^"]+"/g) ?? [])];
console.log("logo fills:", fills.join(", "));

for (const [dir, size] of DENSITIES) {
  const fgSize = Math.round((size * 108) / 48);
  const dirPath = `${RES}/${dir}`;
  if (!fs.existsSync(dirPath)) {
    console.log(`skip ${dir} (missing)`);
    continue;
  }

  const before = sharp(`${dirPath}/ic_launcher.png`).metadata
    ? await sharp(`${dirPath}/ic_launcher.png`).metadata()
    : null;

  fs.writeFileSync(`${dirPath}/ic_launcher.png`, await renderMark(size));
  fs.writeFileSync(`${dirPath}/ic_launcher_round.png`, await circleCrop(size));
  fs.writeFileSync(
    `${dirPath}/ic_launcher_foreground.png`,
    await adaptiveForeground(fgSize),
  );

  const stats = await sharp(`${dirPath}/ic_launcher.png`).stats();
  console.log(
    `${dir}: ${size}px (was ${before ? `${before.width}x${before.height}` : "?"}) → fg ${fgSize}px, mean rgb ${stats.channels
      .slice(0, 3)
      .map((c) => Math.round(c.mean))
      .join("/")}`,
  );
}
console.log("done");
