// 데이터 시각화 워커 - OffscreenCanvas 활용
// 차트 및 그래프 렌더링

// 시각화 타입 정의
enum VisualizationType {
  BAR_CHART = "barChart",
  LINE_CHART = "lineChart",
  PIE_CHART = "pieChart",
  SCATTER_PLOT = "scatterPlot",
  HEATMAP = "heatmap",
}

// 메시지 타입 정의
interface InitMessage {
  type: "init";
  canvas: OffscreenCanvas;
}

interface DataItem {
  label?: string;
  value: number;
  color?: string;
  [key: string]: any; // 추가 데이터
}

interface Point {
  x: number;
  y: number;
  size?: number;
  color?: string;
  label?: string;
}

interface ChartOptions {
  title?: string;
  width?: number;
  height?: number;
  margin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  backgroundColor?: string;
  textColor?: string;
  gridColor?: string;
  showGrid?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
  showValues?: boolean;
  fontSize?: number;
  titleFontSize?: number;
  animate?: boolean;
  padding?: number;
  barSpacing?: number;
  lineWidth?: number;
  pointRadius?: number;
  xAxis?: {
    title?: string;
    min?: number;
    max?: number;
    ticks?: number;
    format?: (value: number) => string;
  };
  yAxis?: {
    title?: string;
    min?: number;
    max?: number;
    ticks?: number;
    format?: (value: number) => string;
  };
  colorScheme?: string[];
  [key: string]: any; // 추가 옵션
}

interface RenderChartMessage {
  type: "render";
  chartType: VisualizationType;
  data: DataItem[] | Point[] | number[][];
  options?: ChartOptions;
}

interface ClearMessage {
  type: "clear";
}

type WorkerMessage = InitMessage | RenderChartMessage | ClearMessage;

// 상태 변수
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let currentOptions: ChartOptions = {
  margin: { top: 40, right: 40, bottom: 60, left: 60 },
  backgroundColor: "white",
  textColor: "#333",
  gridColor: "#ddd",
  fontSize: 12,
  titleFontSize: 18,
  showGrid: true,
  showLabels: true,
  showValues: true,
  padding: 10,
  colorScheme: [
    "#4e79a7",
    "#f28e2c",
    "#e15759",
    "#76b7b2",
    "#59a14f",
    "#edc949",
    "#af7aa1",
    "#ff9da7",
    "#9c755f",
    "#bab0ab",
  ],
};

// 메시지 핸들러
self.onmessage = (event: MessageEvent) => {
  const message = event.data as WorkerMessage;

  try {
    switch (message.type) {
      case "init":
        initializeCanvas(message.canvas);
        break;

      case "render":
        renderVisualization(message.chartType, message.data, message.options);
        break;

      case "clear":
        clearCanvas();
        break;

      default:
        throw new Error("알 수 없는 메시지 타입");
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "알 수 없는 오류",
    });
  }
};

// 캔버스 초기화
function initializeCanvas(offscreenCanvas: OffscreenCanvas): void {
  canvas = offscreenCanvas;
  ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("2D 컨텍스트를 생성할 수 없습니다.");
  }

  self.postMessage({ type: "initialized" });
}

// 캔버스 지우기
function clearCanvas(): void {
  if (!canvas || !ctx) {
    throw new Error("캔버스가 초기화되지 않았습니다.");
  }

  ctx.fillStyle = currentOptions.backgroundColor || "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  self.postMessage({ type: "cleared" });
}

// 시각화 렌더링
function renderVisualization(
  type: VisualizationType,
  data: any[],
  options?: ChartOptions
): void {
  if (!canvas || !ctx) {
    throw new Error("캔버스가 초기화되지 않았습니다.");
  }

  // 옵션 병합
  currentOptions = { ...currentOptions, ...options };

  // 캔버스 지우기
  clearCanvas();

  // 차트 타입에 따라 렌더링
  switch (type) {
    case VisualizationType.BAR_CHART:
      renderBarChart(data as DataItem[]);
      break;

    case VisualizationType.LINE_CHART:
      renderLineChart(data as DataItem[]);
      break;

    case VisualizationType.PIE_CHART:
      renderPieChart(data as DataItem[]);
      break;

    case VisualizationType.SCATTER_PLOT:
      renderScatterPlot(data as Point[]);
      break;

    case VisualizationType.HEATMAP:
      renderHeatmap(data as number[][]);
      break;

    default:
      throw new Error(`지원하지 않는 시각화 타입: ${type}`);
  }

  // 차트 제목 렌더링
  if (currentOptions.title) {
    renderTitle(currentOptions.title);
  }

  // 렌더링 완료 메시지
  self.postMessage({ type: "renderComplete" });
}

// 막대 차트 렌더링
function renderBarChart(data: DataItem[]): void {
  if (!ctx || !canvas) return;

  const margin = currentOptions.margin!;
  const chartWidth = canvas.width - margin.left - margin.right;
  const chartHeight = canvas.height - margin.top - margin.bottom;
  const barCount = data.length;
  const padding = currentOptions.padding || 0;
  const barSpacing = currentOptions.barSpacing || 5;
  const barWidth = Math.max(
    1,
    (chartWidth - (barCount - 1) * barSpacing) / barCount
  );

  // 최대값 찾기
  const maxValue = Math.max(...data.map((d) => d.value));
  const yScale = chartHeight / (maxValue * 1.1); // 10% 여유 공간

  // 축 그리기
  drawAxis(chartWidth, chartHeight, margin);

  // 막대 그리기
  data.forEach((item, index) => {
    const x = margin.left + index * (barWidth + barSpacing);
    const barHeight = item.value * yScale;
    const y = canvas!.height - margin.bottom - barHeight;

    // 막대 색상
    const color = item.color || getColorFromScheme(index);

    // 막대 그리기
    ctx!.fillStyle = color;
    ctx!.fillRect(x, y, barWidth, barHeight);

    // 테두리
    ctx!.strokeStyle = darkenColor(color, 0.2);
    ctx!.lineWidth = 1;
    ctx!.strokeRect(x, y, barWidth, barHeight);

    // 라벨 렌더링
    if (currentOptions.showLabels && item.label) {
      ctx!.fillStyle = currentOptions.textColor!;
      ctx!.font = `${currentOptions.fontSize}px Arial`;
      ctx!.textAlign = "center";
      ctx!.fillText(
        item.label,
        x + barWidth / 2,
        canvas!.height - margin.bottom + 20
      );
    }

    // 값 렌더링
    if (currentOptions.showValues) {
      ctx!.fillStyle = currentOptions.textColor!;
      ctx!.font = `${currentOptions.fontSize}px Arial`;
      ctx!.textAlign = "center";
      ctx!.fillText(item.value.toString(), x + barWidth / 2, y - 5);
    }
  });
}

// 선 차트 렌더링
function renderLineChart(data: DataItem[]): void {
  if (!ctx || !canvas) return;

  const margin = currentOptions.margin!;
  const chartWidth = canvas.width - margin.left - margin.right;
  const chartHeight = canvas.height - margin.top - margin.bottom;
  const pointCount = data.length;
  const lineWidth = currentOptions.lineWidth || 2;
  const pointRadius = currentOptions.pointRadius || 4;

  // 최대값 찾기
  const maxValue = Math.max(...data.map((d) => d.value));
  const yScale = chartHeight / (maxValue * 1.1); // 10% 여유 공간
  const xScale = chartWidth / (pointCount - 1 || 1);

  // 축 그리기
  drawAxis(chartWidth, chartHeight, margin);

  // 선 그리기
  ctx.beginPath();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = currentOptions.colorScheme![0];

  data.forEach((item, index) => {
    const x = margin.left + index * xScale;
    const y = canvas!.height - margin.bottom - item.value * yScale;

    if (index === 0) {
      ctx!.moveTo(x, y);
    } else {
      ctx!.lineTo(x, y);
    }

    // 포인트 그리기
    ctx!.fillStyle = item.color || currentOptions.colorScheme![0];
    ctx!.beginPath();
    ctx!.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx!.fill();

    // 라벨 렌더링
    if (currentOptions.showLabels && item.label) {
      ctx!.fillStyle = currentOptions.textColor!;
      ctx!.font = `${currentOptions.fontSize}px Arial`;
      ctx!.textAlign = "center";
      ctx!.fillText(item.label, x, canvas!.height - margin.bottom + 20);
    }

    // 값 렌더링
    if (currentOptions.showValues) {
      ctx!.fillStyle = currentOptions.textColor!;
      ctx!.font = `${currentOptions.fontSize}px Arial`;
      ctx!.textAlign = "center";
      ctx!.fillText(item.value.toString(), x, y - 15);
    }
  });

  ctx.stroke();
}

// 파이 차트 렌더링
function renderPieChart(data: DataItem[]): void {
  if (!ctx || !canvas) return;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) * 0.8;

  // 총합 계산
  const total = data.reduce((sum, item) => sum + item.value, 0);

  // 시작 각도
  let startAngle = 0;

  // 각 부분 그리기
  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    // 부채꼴 그리기
    ctx!.beginPath();
    ctx!.moveTo(centerX, centerY);
    ctx!.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx!.closePath();

    // 색상 설정
    ctx!.fillStyle = item.color || getColorFromScheme(index);
    ctx!.fill();

    // 테두리
    ctx!.strokeStyle = "white";
    ctx!.lineWidth = 2;
    ctx!.stroke();

    // 라벨 위치 계산 (부채꼴 중앙)
    const labelAngle = startAngle + sliceAngle / 2;
    const labelRadius = radius * 0.7;
    const labelX = centerX + Math.cos(labelAngle) * labelRadius;
    const labelY = centerY + Math.sin(labelAngle) * labelRadius;

    // 값 레이블 렌더링
    if (currentOptions.showValues) {
      ctx!.fillStyle = "white";
      ctx!.font = `bold ${currentOptions.fontSize}px Arial`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";

      const percentage = Math.round((item.value / total) * 100);
      ctx!.fillText(`${percentage}%`, labelX, labelY);
    }

    // 범례 항목 그리기
    if (currentOptions.showLegend && item.label) {
      const legendY = canvas!.height - 40 + index * 20;

      // 범례 색상 상자
      ctx!.fillStyle = item.color || getColorFromScheme(index);
      ctx!.fillRect(20, legendY, 15, 15);

      // 범례 텍스트
      ctx!.fillStyle = currentOptions.textColor!;
      ctx!.font = `${currentOptions.fontSize}px Arial`;
      ctx!.textAlign = "left";
      ctx!.textBaseline = "middle";
      ctx!.fillText(`${item.label}: ${item.value}`, 45, legendY + 7);
    }

    // 다음 부채꼴 시작 각도 업데이트
    startAngle = endAngle;
  });
}

// 산점도 차트 렌더링
function renderScatterPlot(data: Point[]): void {
  if (!ctx || !canvas) return;

  const margin = currentOptions.margin!;
  const chartWidth = canvas.width - margin.left - margin.right;
  const chartHeight = canvas.height - margin.top - margin.bottom;

  // 데이터 범위 찾기
  const xValues = data.map((p) => p.x);
  const yValues = data.map((p) => p.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  // 스케일 계산
  const xScale = chartWidth / (xMax - xMin || 1);
  const yScale = chartHeight / (yMax - yMin || 1);

  // 축 그리기
  drawAxis(chartWidth, chartHeight, margin, xMin, xMax, yMin, yMax);

  // 포인트 그리기
  data.forEach((point, index) => {
    const x = margin.left + (point.x - xMin) * xScale;
    const y = canvas!.height - margin.bottom - (point.y - yMin) * yScale;
    const pointSize = point.size || 6;

    // 포인트 색상
    const color =
      point.color ||
      getColorFromScheme(index % currentOptions.colorScheme!.length);

    // 포인트 그리기
    ctx!.fillStyle = color;
    ctx!.beginPath();
    ctx!.arc(x, y, pointSize, 0, Math.PI * 2);
    ctx!.fill();

    // 테두리
    ctx!.strokeStyle = darkenColor(color, 0.2);
    ctx!.lineWidth = 1;
    ctx!.stroke();

    // 라벨 렌더링
    if (currentOptions.showLabels && point.label) {
      ctx!.fillStyle = currentOptions.textColor!;
      ctx!.font = `${currentOptions.fontSize}px Arial`;
      ctx!.textAlign = "center";
      ctx!.fillText(point.label, x, y - pointSize - 5);
    }
  });
}

// 히트맵 렌더링
function renderHeatmap(data: number[][]): void {
  if (!ctx || !canvas) return;

  const margin = currentOptions.margin!;
  const chartWidth = canvas.width - margin.left - margin.right;
  const chartHeight = canvas.height - margin.top - margin.bottom;

  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;

  if (rows === 0 || cols === 0) return;

  // 셀 크기 계산
  const cellWidth = chartWidth / cols;
  const cellHeight = chartHeight / rows;

  // 최대, 최소값 찾기
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      min = Math.min(min, data[i][j]);
      max = Math.max(max, data[i][j]);
    }
  }

  // 각 셀 그리기
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const value = data[i][j];
      const normalizedValue = (value - min) / (max - min || 1);

      // 히트맵 색상 계산 (파란색 -> 빨간색)
      const color = getHeatmapColor(normalizedValue);

      // 셀 위치 계산
      const x = margin.left + j * cellWidth;
      const y = margin.top + i * cellHeight;

      // 셀 그리기
      ctx!.fillStyle = color;
      ctx!.fillRect(x, y, cellWidth, cellHeight);

      // 테두리
      ctx!.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx!.lineWidth = 1;
      ctx!.strokeRect(x, y, cellWidth, cellHeight);

      // 값 렌더링
      if (currentOptions.showValues) {
        ctx!.fillStyle = getBestTextColor(color);
        ctx!.font = `${Math.min(
          cellWidth / 3.5,
          currentOptions.fontSize!
        )}px Arial`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText(value.toFixed(1), x + cellWidth / 2, y + cellHeight / 2);
      }
    }
  }

  // 컬러 범례 그리기
  drawColorLegend(margin.left, canvas.height - 20, chartWidth, 10, min, max);
}

// 축 그리기
function drawAxis(
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
  xMin: number = 0,
  xMax: number = 0,
  yMin: number = 0,
  yMax: number = 0
): void {
  if (!ctx || !canvas) return;

  const xStart = margin.left;
  const xEnd = margin.left + width;
  const yStart = canvas.height - margin.bottom;
  const yEnd = margin.top;

  // X축
  ctx.beginPath();
  ctx.moveTo(xStart, yStart);
  ctx.lineTo(xEnd, yStart);
  ctx.strokeStyle = currentOptions.textColor!;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Y축
  ctx.beginPath();
  ctx.moveTo(xStart, yStart);
  ctx.lineTo(xStart, yEnd);
  ctx.stroke();

  // 그리드 그리기
  if (currentOptions.showGrid) {
    const xTicks = currentOptions.xAxis?.ticks || 5;
    const yTicks = currentOptions.yAxis?.ticks || 5;

    // X축 그리드
    for (let i = 1; i <= xTicks; i++) {
      const x = xStart + (width * i) / xTicks;

      ctx.beginPath();
      ctx.moveTo(x, yStart);
      ctx.lineTo(x, yEnd);
      ctx.strokeStyle = currentOptions.gridColor!;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // X축 레이블
      if (currentOptions.xAxis) {
        const value = xMin + ((xMax - xMin) * i) / xTicks;
        const formattedValue = currentOptions.xAxis.format
          ? currentOptions.xAxis.format(value)
          : value.toString();

        ctx.fillStyle = currentOptions.textColor!;
        ctx.font = `${currentOptions.fontSize}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(formattedValue, x, yStart + 20);
      }
    }

    // Y축 그리드
    for (let i = 1; i <= yTicks; i++) {
      const y = yStart - (height * i) / yTicks;

      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(xEnd, y);
      ctx.strokeStyle = currentOptions.gridColor!;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Y축 레이블
      if (currentOptions.yAxis) {
        const value = yMin + ((yMax - yMin) * i) / yTicks;
        const formattedValue = currentOptions.yAxis.format
          ? currentOptions.yAxis.format(value)
          : value.toString();

        ctx.fillStyle = currentOptions.textColor!;
        ctx.font = `${currentOptions.fontSize}px Arial`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(formattedValue, xStart - 10, y);
      }
    }
  }

  // 축 제목
  if (currentOptions.xAxis?.title) {
    ctx.fillStyle = currentOptions.textColor!;
    ctx.font = `${currentOptions.fontSize! + 2}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(currentOptions.xAxis.title, xStart + width / 2, yStart + 40);
  }

  if (currentOptions.yAxis?.title) {
    ctx.save();
    ctx.translate(xStart - 40, yStart - height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = currentOptions.textColor!;
    ctx.font = `${currentOptions.fontSize! + 2}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(currentOptions.yAxis.title, 0, 0);
    ctx.restore();
  }
}

// 제목 렌더링
function renderTitle(title: string): void {
  if (!ctx || !canvas) return;

  ctx.fillStyle = currentOptions.textColor!;
  ctx.font = `bold ${currentOptions.titleFontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, canvas.width / 2, 10);
}

// 컬러 스킴에서 색상 가져오기
function getColorFromScheme(index: number): string {
  if (!currentOptions.colorScheme || currentOptions.colorScheme.length === 0) {
    return "#4e79a7";
  }

  return currentOptions.colorScheme[index % currentOptions.colorScheme.length];
}

// 히트맵 색상 생성 (Blue -> Red)
function getHeatmapColor(value: number): string {
  // 값이 0일 때 파란색, 1일 때 빨간색
  const r = Math.floor(255 * value);
  const b = Math.floor(255 * (1 - value));
  return `rgb(${r}, 0, ${b})`;
}

// 색상 레전드 그리기
function drawColorLegend(
  x: number,
  y: number,
  width: number,
  height: number,
  min: number,
  max: number
): void {
  if (!ctx) return;

  // 그라데이션 생성
  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, getHeatmapColor(0));
  gradient.addColorStop(0.5, getHeatmapColor(0.5));
  gradient.addColorStop(1, getHeatmapColor(1));

  // 레전드 바 그리기
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);

  // 테두리
  ctx.strokeStyle = currentOptions.textColor!;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, width, height);

  // 최소/최대 레이블
  ctx.fillStyle = currentOptions.textColor!;
  ctx.font = `${currentOptions.fontSize}px Arial`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(min.toFixed(1), x, y + height + 5);

  ctx.textAlign = "right";
  ctx.fillText(max.toFixed(1), x + width, y + height + 5);
}

// 색상 어둡게 하기
function darkenColor(color: string, amount: number): string {
  // HEX 색상 파싱
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return `rgb(${Math.max(0, r - amount * 255)}, ${Math.max(
      0,
      g - amount * 255
    )}, ${Math.max(0, b - amount * 255)})`;
  }

  // RGB 색상 파싱
  if (color.startsWith("rgb")) {
    const match = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);

      return `rgb(${Math.max(0, r - amount * 255)}, ${Math.max(
        0,
        g - amount * 255
      )}, ${Math.max(0, b - amount * 255)})`;
    }
  }

  return color;
}

// 배경색에 따른 최적의 텍스트 색상 반환 (대비)
function getBestTextColor(bgColor: string): string {
  let r = 0,
    g = 0,
    b = 0;

  // HEX 색상 파싱
  if (bgColor.startsWith("#")) {
    const hex = bgColor.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  // RGB 색상 파싱
  else if (bgColor.startsWith("rgb")) {
    const match = bgColor.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    }
  }

  // YIQ 공식을 사용하여 밝기 계산
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "black" : "white";
}

// 워커 초기 메시지
self.postMessage({ type: "ready" });
