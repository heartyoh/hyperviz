const fs = require("fs");
const path = require("path");

// 필요한 파일 목록
const requiredFiles = [
  "dist/index.js",
  "dist/index.mjs",
  "dist/index.d.ts",
  "dist/worker/index.js",
  "dist/worker/index.mjs",
  "dist/worker/renderer.js",
  "dist/worker/renderer.mjs",
];

// 빌드 검증 함수
function validateBuild() {
  console.log("웹워커 파일 빌드 검증 시작...");

  let allFilesExist = true;
  const missingFiles = [];

  // 모든 필수 파일이 존재하는지 확인
  for (const file of requiredFiles) {
    const filePath = path.resolve(__dirname, "..", file);

    if (!fs.existsSync(filePath)) {
      allFilesExist = false;
      missingFiles.push(file);
      console.error(`[오류] 파일이 없음: ${file}`);
    } else {
      console.log(`[확인] 파일 존재: ${file}`);

      // 파일 내용 검증 (예: 웹워커 파일에 Comlink가 포함되어 있는지)
      if (file.includes("worker")) {
        const content = fs.readFileSync(filePath, "utf8");
        if (!content.includes("comlink")) {
          console.warn(
            `[주의] ${file} 파일에 Comlink가 포함되어 있지 않을 수 있습니다.`
          );
        }
      }
    }
  }

  if (allFilesExist) {
    console.log("웹워커 파일 검증 성공! 모든 필요 파일이 존재합니다.");
    return true;
  } else {
    console.error(
      `웹워커 파일 검증 실패! 누락된 파일: ${missingFiles.join(", ")}`
    );
    process.exit(1); // 오류 코드로 종료
  }
}

// 스크립트 실행
validateBuild();
