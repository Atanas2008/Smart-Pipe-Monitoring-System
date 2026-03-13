'use strict';

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Leak detection threshold (L/min)
const LEAK_THRESHOLD = 1.0;

// In-memory store for the latest sensor readings
let latestData = {
  flow1: null,
  flow2: null,
  flow3: null,
  ph: null,
  timestamp: null,
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/sensors
 * Receives sensor data from the ESP32 and stores the latest values.
 * Expected JSON body: { flow1, flow2, flow3, ph }
 */
app.post('/api/sensors', (req, res) => {
  const { flow1, flow2, flow3, ph } = req.body;

  if (
    flow1 === undefined ||
    flow2 === undefined ||
    flow3 === undefined ||
    ph === undefined
  ) {
    return res.status(400).json({ error: 'Missing required fields: flow1, flow2, flow3, ph' });
  }

  if (
    typeof flow1 !== 'number' ||
    typeof flow2 !== 'number' ||
    typeof flow3 !== 'number' ||
    typeof ph !== 'number'
  ) {
    return res.status(400).json({ error: 'All fields must be numbers' });
  }

  latestData = {
    flow1,
    flow2,
    flow3,
    ph,
    timestamp: new Date().toISOString(),
  };

  res.json({ success: true, received: latestData });
});

/**
 * GET /api/status
 * Returns the latest sensor values along with leak detection results.
 */
app.get('/api/status', (req, res) => {
  const leaks = detectLeaks(latestData);
  res.json({ ...latestData, leaks });
});

/**
 * Determine leak locations based on flow sensor differences.
 * @param {{ flow1: number|null, flow2: number|null, flow3: number|null }} data
 * @returns {{ leak1_2: boolean, leak2_3: boolean }}
 */
function detectLeaks(data) {
  const { flow1, flow2, flow3 } = data;

  const leak1_2 =
    flow1 !== null && flow2 !== null
      ? Math.abs(flow1 - flow2) > LEAK_THRESHOLD
      : false;

  const leak2_3 =
    flow2 !== null && flow3 !== null
      ? Math.abs(flow2 - flow3) > LEAK_THRESHOLD
      : false;

  return { leak1_2, leak2_3 };
}

// Only start listening when run directly (not during tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Smart Pipe Monitoring Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, detectLeaks };
