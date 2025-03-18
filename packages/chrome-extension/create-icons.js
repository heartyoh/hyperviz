import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 아이콘 폴더 경로
const iconsDir = path.join(__dirname, "src", "assets", "icons");

// 필요한 폴더가 없으면 생성
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 아이콘 생성 (일반 아이콘과 활성화된 아이콘)
const sizes = [16, 48, 128];

// 일반 아이콘 (파란색)
for (const size of sizes) {
  // 파란색 배경에 H 글자가 있는 SVG 아이콘
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#4A86E8"/>
    <text x="50%" y="50%" dy=".3em" text-anchor="middle" fill="white" font-size="${
      size * 0.6
    }" font-family="Arial, sans-serif">H</text>
  </svg>`;

  // SVG 파일로 저장
  const svgFilePath = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(svgFilePath, svgContent);

  // 같은 이름의 PNG 파일도 생성
  const pngFilePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(pngFilePath, svgContent);

  console.log(`아이콘 생성됨: icon${size}.svg 및 icon${size}.png`);
}

// 활성화된 아이콘 (보라색)
for (const size of sizes) {
  // 보라색 배경에 H 글자가 있는 SVG 아이콘
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#8A4BE8"/>
    <text x="50%" y="50%" dy=".3em" text-anchor="middle" fill="white" font-size="${
      size * 0.6
    }" font-family="Arial, sans-serif">H</text>
  </svg>`;

  // SVG 파일로 저장
  const svgFilePath = path.join(iconsDir, `icon${size}-active.svg`);
  fs.writeFileSync(svgFilePath, svgContent);

  // 같은 이름의 PNG 파일도 생성
  const pngFilePath = path.join(iconsDir, `icon${size}-active.png`);
  fs.writeFileSync(pngFilePath, svgContent);

  console.log(
    `활성 아이콘 생성됨: icon${size}-active.svg 및 icon${size}-active.png`
  );
}

console.log("모든 아이콘이 생성되었습니다.");
