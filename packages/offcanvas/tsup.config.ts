import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/worker/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "es2020",
  esbuildOptions(options) {
    options.bundle = true;
    options.outbase = "src";

    options.loader = {
      ...(options.loader || {}),
      ".ts": "ts",
    };
  },
  async onSuccess() {
    console.log("빌드 성공! 웹워커 파일들이 올바르게 생성되었습니다.");
  },
});
