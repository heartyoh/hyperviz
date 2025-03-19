/**
 * HyperViz WorkerPool 모니터링 패널
 */

// 전역 변수
let refreshInterval = null;
let taskChart = null;
let workerPoolData = null;
let isConnected = false;
let refreshRate = 2000; // 기본 새로고침 간격 (ms)

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  initializePanel();
});

// 패널 초기화 함수 (devtools.js에서 호출할 수 있음)
window.initializePanel = function () {
  console.log("WorkerPool 패널 초기화 중...");
  setupEventListeners();
  setupCharts();
  connectToWorkerPool();
  startAutoRefresh();
};

// 이벤트 리스너 설정
function setupEventListeners() {
  // 수동 새로고침 버튼
  document.getElementById("btn-refresh").addEventListener("click", () => {
    fetchWorkerPoolData();
  });

  // 자동 새로고침 토글
  document
    .getElementById("autoRefreshToggle")
    .addEventListener("change", (e) => {
      if (e.target.checked) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    });

  // 새로고침 간격 변경
  document.getElementById("refresh-rate").addEventListener("change", (e) => {
    refreshRate = parseInt(e.target.value, 10);
    if (refreshInterval) {
      stopAutoRefresh();
      startAutoRefresh();
    }
  });

  // 설정 적용 버튼
  document
    .getElementById("btn-apply-settings")
    .addEventListener("click", () => {
      applyWorkerPoolSettings();
    });

  // 설정 초기화 버튼
  document
    .getElementById("btn-reset-settings")
    .addEventListener("click", () => {
      resetWorkerPoolSettings();
    });

  // 모든 워커 종료 버튼
  document.getElementById("btn-terminate-all").addEventListener("click", () => {
    terminateAllWorkers();
  });
}

// 차트 설정
function setupCharts() {
  const ctx = document.getElementById("taskChart").getContext("2d");

  taskChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["대기 중", "실행 중", "완료됨", "실패"],
      datasets: [
        {
          data: [0, 0, 0, 0],
          backgroundColor: [
            "#6c757d", // 대기 중 - 회색
            "#0d6efd", // 실행 중 - 파란색
            "#198754", // 완료됨 - 녹색
            "#dc3545", // 실패 - 빨간색
          ],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
        },
      },
    },
  });
}

// 워커풀에 연결
function connectToWorkerPool() {
  updateConnectionStatus("연결 중...", false);

  // 검사 중인 페이지에서 워커풀 객체 확인
  chrome.devtools.inspectedWindow.eval(
    `typeof window.hypervizWorkerPool !== 'undefined'`,
    (hasWorkerPool, isException) => {
      if (isException || !hasWorkerPool) {
        updateConnectionStatus("연결 실패: 워커풀을 찾을 수 없음", false);
        return;
      }

      isConnected = true;
      updateConnectionStatus("연결됨", true);
      fetchWorkerPoolData();
    }
  );
}

// 연결 상태 업데이트
function updateConnectionStatus(message, connected) {
  const statusEl = document.getElementById("connection-status");
  statusEl.textContent = message;

  if (connected) {
    statusEl.classList.remove("status-offline");
    statusEl.classList.add("status-online");
  } else {
    statusEl.classList.remove("status-online");
    statusEl.classList.add("status-offline");
  }
}

// 자동 새로고침 시작
function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(() => {
    if (isConnected) {
      fetchWorkerPoolData();
    }
  }, refreshRate);

  console.log(`자동 새로고침 시작 (${refreshRate}ms 간격)`);
}

// 자동 새로고침 중지
function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log("자동 새로고침 중지");
  }
}

// 워커풀 데이터 가져오기
function fetchWorkerPoolData() {
  if (!isConnected) {
    return;
  }

  console.log("워커풀 데이터 가져오는 중...");

  // 현재 스탯 가져오기
  chrome.devtools.inspectedWindow.eval(
    `
    (function() {
      try {
        const pool = window.hypervizWorkerPool;
        if (!pool) return null;
        
        return {
          stats: pool.getStats(),
          taskInfo: pool.getTaskInfo(),
          logs: pool.getLogs(50)
        };
      } catch (error) {
        console.error("워커풀 데이터 가져오기 오류:", error);
        return null;
      }
    })()
    `,
    (result, isException) => {
      if (isException || !result) {
        console.error("워커풀 데이터 가져오기 실패:", isException);
        updateConnectionStatus("데이터 가져오기 실패", false);
        return;
      }

      workerPoolData = result;
      updateUI(result);
    }
  );
}

// UI 업데이트
function updateUI(data) {
  if (!data) return;

  updateConnectionStatus("연결됨", true);

  // 워커풀 상태 업데이트
  updateWorkerPoolStats(data.stats);

  // 태스크 정보 업데이트
  updateTaskInfo(data.taskInfo);

  // 로그 업데이트
  updateLogs(data.logs);
}

// 워커풀 상태 업데이트
function updateWorkerPoolStats(stats) {
  if (!stats) return;

  // CALC 유형의 워커풀 통계 가져오기 (예시로 사용, 실제 구현에서는 모든 유형 처리 필요)
  const poolStats = stats["CALC"] || {
    workerCount: 0,
    activeWorkers: 0,
    idleWorkers: 0,
    queuedTasks: 0,
    activeTasks: 0,
  };

  // 기본 통계 업데이트
  document.getElementById("worker-count").textContent =
    poolStats.workerCount || 0;
  document.getElementById("active-workers").textContent =
    poolStats.activeWorkers || 0;
  document.getElementById("idle-workers").textContent =
    poolStats.idleWorkers || 0;
  document.getElementById("queued-tasks").textContent =
    poolStats.queuedTasks || 0;
  document.getElementById("active-tasks").textContent =
    poolStats.activeTasks || 0;

  // 워커당 평균 태스크 계산
  const workersCount = poolStats.workerCount || 1; // 0으로 나누기 방지
  const tasksPerWorker = ((poolStats.activeTasks || 0) / workersCount).toFixed(
    2
  );
  document.getElementById("tasks-per-worker").textContent = tasksPerWorker;

  // 워커 사용률 계산 및 표시
  const workerUsage =
    poolStats.workerCount > 0
      ? Math.round((poolStats.activeWorkers / poolStats.workerCount) * 100)
      : 0;

  const usageBar = document.getElementById("worker-usage-bar");
  usageBar.style.width = `${workerUsage}%`;
  usageBar.textContent = `${workerUsage}%`;

  // 색상 조정
  if (workerUsage < 30) {
    usageBar.className = "progress-bar bg-success";
  } else if (workerUsage < 70) {
    usageBar.className = "progress-bar bg-warning";
  } else {
    usageBar.className = "progress-bar bg-danger";
  }
}

// 태스크 정보 업데이트
function updateTaskInfo(taskInfo) {
  if (!taskInfo) return;

  // 기본 태스크 통계 업데이트
  document.getElementById("total-tasks").textContent = taskInfo.total || 0;
  document.getElementById("completed-tasks").textContent =
    taskInfo.completed || 0;
  document.getElementById("failed-tasks").textContent = taskInfo.failed || 0;

  // 임시 데이터 (실제 구현에서는 API에서 가져와야 함)
  document.getElementById("avg-processing-time").textContent = "245ms";
  document.getElementById("max-processing-time").textContent = "912ms";

  // 완료율 계산
  const completionRate =
    taskInfo.total > 0
      ? Math.round((taskInfo.completed / taskInfo.total) * 100)
      : 0;
  document.getElementById("completion-rate").textContent = `${completionRate}%`;

  // 차트 데이터 업데이트
  const waiting =
    (taskInfo.total || 0) - (taskInfo.completed || 0) - (taskInfo.failed || 0);
  const active = workerPoolData?.stats?.CALC?.activeTasks || 0;
  const completed = taskInfo.completed || 0;
  const failed = taskInfo.failed || 0;

  if (taskChart) {
    taskChart.data.datasets[0].data = [
      waiting - active, // 대기 중 (활성 제외)
      active, // 실행 중
      completed, // 완료됨
      failed, // 실패
    ];
    taskChart.update();
  }
}

// 로그 업데이트
function updateLogs(logs) {
  if (!logs || !logs.length) return;

  const logsContainer = document.getElementById("logs-container");

  // 컨테이너 비우기 (필요한 경우 기존 로그 유지 가능)
  logsContainer.innerHTML = "";

  // 로그 추가
  logs.forEach((log) => {
    const logItem = document.createElement("div");
    logItem.className = "log-item";

    // 로그 타입에 따른 스타일 적용
    if (log.level === "error") {
      logItem.classList.add("log-error");
    } else if (log.level === "warn") {
      logItem.classList.add("log-warning");
    } else if (log.level === "info") {
      logItem.classList.add("log-info");
    }

    // 타임스탬프 및 메시지 추가
    const timestamp = new Date(log.timestamp).toISOString();
    logItem.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${log.message}`;

    logsContainer.appendChild(logItem);
  });

  // 스크롤을 아래로 이동
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// 워커풀 설정 적용
function applyWorkerPoolSettings() {
  const minWorkers = parseInt(document.getElementById("min-workers").value, 10);
  const maxWorkers = parseInt(document.getElementById("max-workers").value, 10);
  const idleTimeout = parseInt(
    document.getElementById("idle-timeout").value,
    10
  );
  const taskTimeout = parseInt(
    document.getElementById("task-timeout").value,
    10
  );

  if (minWorkers > maxWorkers) {
    alert("최소 워커 수는 최대 워커 수보다 클 수 없습니다.");
    return;
  }

  chrome.devtools.inspectedWindow.eval(
    `
    (function() {
      try {
        const pool = window.hypervizWorkerPool?.manager;
        if (!pool) return false;
        
        pool.updatePoolConfig({
          minWorkers: ${minWorkers},
          maxWorkers: ${maxWorkers},
          idleTimeout: ${idleTimeout}
        });
        
        pool.setTaskTimeout(${taskTimeout});
        
        return true;
      } catch (error) {
        console.error("워커풀 설정 변경 오류:", error);
        return false;
      }
    })()
    `,
    (result, isException) => {
      if (isException || !result) {
        alert("워커풀 설정 적용 실패");
        return;
      }

      alert("워커풀 설정이 성공적으로 적용되었습니다.");
      fetchWorkerPoolData(); // 업데이트된 데이터 가져오기
    }
  );
}

// 워커풀 설정 초기화
function resetWorkerPoolSettings() {
  document.getElementById("min-workers").value = 2;
  document.getElementById("max-workers").value = 8;
  document.getElementById("idle-timeout").value = 30000;
  document.getElementById("task-timeout").value = 10000;
}

// 모든 워커 종료
function terminateAllWorkers() {
  if (confirm("정말로 모든 워커를 종료하시겠습니까?")) {
    chrome.devtools.inspectedWindow.eval(
      `
      (function() {
        try {
          const pool = window.hypervizWorkerPool?.manager;
          if (!pool) return false;
          
          return pool.terminateAllWorkers();
        } catch (error) {
          console.error("워커 종료 오류:", error);
          return false;
        }
      })()
      `,
      (result, isException) => {
        if (isException) {
          alert("워커 종료 중 오류가 발생했습니다.");
          return;
        }

        alert("모든 워커가 종료되었습니다.");
        fetchWorkerPoolData(); // 업데이트된 데이터 가져오기
      }
    );
  }
}
