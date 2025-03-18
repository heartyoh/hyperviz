/**
 * @hyperviz/worker-pool 예제 서버
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 정적 파일 제공
app.use("/dist", express.static(path.join(__dirname, "../dist")));
app.use("/examples", express.static(__dirname));
// 워커 스크립트 파일 제공
app.use("/workers", express.static(path.join(__dirname, "../dist/workers")));

// 메인 페이지
app.get("/", (req, res) => {
  res.redirect("/examples/chrome-extension-demo.html");
});

// 서버 시작
app.listen(PORT, () => {
  console.log(
    `워커풀 데모 서버가 http://localhost:${PORT}/ 에서 실행 중입니다.`
  );
  console.log(
    `Chrome 확장 프로그램 데모: http://localhost:${PORT}/examples/chrome-extension-demo.html`
  );
});
