'use strict';

const POLL_INTERVAL_MS = 5000; // fetch new data every 5 seconds
const MAX_HISTORY_POINTS = 20;  // keep last 20 readings on the chart

// ── Chart setup ──────────────────────────────────────────────────────────────
const ctx = document.getElementById('flowChart').getContext('2d');

const chartData = {
  labels: [],
  datasets: [
    {
      label: 'Flow 1 (L/min)',
      data: [],
      borderColor: '#64dfdf',
      backgroundColor: 'rgba(100,223,223,0.12)',
      tension: 0.35,
      fill: true,
    },
    {
      label: 'Flow 2 (L/min)',
      data: [],
      borderColor: '#f4a261',
      backgroundColor: 'rgba(244,162,97,0.12)',
      tension: 0.35,
      fill: true,
    },
    {
      label: 'Flow 3 (L/min)',
      data: [],
      borderColor: '#a8dadc',
      backgroundColor: 'rgba(168,218,220,0.12)',
      tension: 0.35,
      fill: true,
    },
  ],
};

const flowChart = new Chart(ctx, {
  type: 'line',
  data: chartData,
  options: {
    responsive: true,
    animation: { duration: 300 },
    scales: {
      x: {
        ticks: { color: '#8892b0', maxRotation: 45 },
        grid: { color: '#1e3a5f' },
      },
      y: {
        ticks: { color: '#8892b0' },
        grid: { color: '#1e3a5f' },
        title: { display: true, text: 'L/min', color: '#8892b0' },
      },
    },
    plugins: {
      legend: { labels: { color: '#e0f4ff' } },
    },
  },
});

// ── DOM references ────────────────────────────────────────────────────────────
const elFlow1      = document.getElementById('flow1');
const elFlow2      = document.getElementById('flow2');
const elFlow3      = document.getElementById('flow3');
const elPh         = document.getElementById('ph');
const elStatus     = document.getElementById('system-status');
const elStatusCard = document.getElementById('status-section');
const elLeak1_2    = document.getElementById('leak1_2');
const elLeak2_3    = document.getElementById('leak2_3');
const elUpdated    = document.getElementById('last-updated');

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val) {
  return val !== null && val !== undefined ? Number(val).toFixed(2) : '—';
}

function timeLabel() {
  return new Date().toLocaleTimeString();
}

function pushToChart(flow1, flow2, flow3) {
  chartData.labels.push(timeLabel());
  chartData.datasets[0].data.push(flow1);
  chartData.datasets[1].data.push(flow2);
  chartData.datasets[2].data.push(flow3);

  if (chartData.labels.length > MAX_HISTORY_POINTS) {
    chartData.labels.shift();
    chartData.datasets.forEach(ds => ds.data.shift());
  }

  flowChart.update();
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Update sensor value displays
    elFlow1.innerHTML = `${fmt(data.flow1)} <span class="unit">L/min</span>`;
    elFlow2.innerHTML = `${fmt(data.flow2)} <span class="unit">L/min</span>`;
    elFlow3.innerHTML = `${fmt(data.flow3)} <span class="unit">L/min</span>`;
    elPh.textContent  = fmt(data.ph);

    // Update chart
    if (data.flow1 !== null) {
      pushToChart(data.flow1, data.flow2, data.flow3);
    }

    // Leak detection UI
    const { leak1_2, leak2_3 } = data.leaks || {};
    const anyLeak = leak1_2 || leak2_3;

    setLeakItem(elLeak1_2, leak1_2, 'between Sensor 1 and Sensor 2');
    setLeakItem(elLeak2_3, leak2_3, 'between Sensor 2 and Sensor 3');

    // System status banner
    if (data.timestamp === null) {
      elStatus.textContent = 'Awaiting first data from ESP32…';
      elStatusCard.className = 'card status-ok';
    } else if (anyLeak) {
      elStatus.textContent = '⚠ Leak detected! Check pipe sections below.';
      elStatusCard.className = 'card status-leak';
    } else {
      elStatus.textContent = '✓ All systems normal — no leaks detected.';
      elStatusCard.className = 'card status-ok';
    }

    elUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error('Failed to fetch status:', err);
    elStatus.textContent = 'Error connecting to server.';
    elStatusCard.className = 'card status-leak';
  }
}

function setLeakItem(el, isLeak, location) {
  if (isLeak) {
    el.textContent = `⚠ Leak detected ${location}`;
    el.className = 'leak-item leak-detected';
  } else {
    el.textContent = `✓ No leak ${location}`;
    el.className = 'leak-item no-leak';
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
fetchStatus();
setInterval(fetchStatus, POLL_INTERVAL_MS);
