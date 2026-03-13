# Smart Pipe Monitoring System

A full-stack IoT web application for monitoring water pipes in real time using an ESP32 microcontroller, three YF-S201 water flow sensors, and a pH sensor.

---

## Repository Layout

```
├── esp32/
│   └── smart_pipe_monitor.ino   # ESP32 Arduino firmware
└── server/
    ├── server.js                # Node.js / Express backend
    ├── server.test.js           # Jest unit & integration tests
    ├── package.json
    └── public/
        ├── index.html           # Dashboard UI
        ├── style.css
        └── app.js               # Chart.js + polling logic
```

---

## Hardware

| Component | Quantity | Notes |
|-----------|----------|-------|
| ESP32 development board | 1 | Any standard ESP32 devkit |
| YF-S201 water flow sensor | 3 | Connected to GPIO 18, 19, 21 |
| Analog pH sensor module | 1 | Connected to GPIO 34 (ADC1) |

---

## Backend Setup

### Prerequisites
- Node.js ≥ 18

### Install & Run

```bash
cd server
npm install
npm start
```

The server listens on **port 3000** by default (override with the `PORT` environment variable).

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sensors` | Receive sensor data from the ESP32 |
| `GET`  | `/api/status`  | Return latest values + leak detection |

#### POST `/api/sensors` – request body

```json
{
  "flow1": 10.2,
  "flow2": 7.9,
  "flow3": 7.8,
  "ph": 7.3
}
```

#### GET `/api/status` – example response

```json
{
  "flow1": 10.2,
  "flow2": 7.9,
  "flow3": 7.8,
  "ph": 7.3,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "leaks": {
    "leak1_2": true,
    "leak2_3": false
  }
}
```

### Leak Detection Logic

A leak is flagged when the absolute difference between consecutive flow sensors exceeds **1.0 L/min**:

- `|flow1 − flow2| > 1.0` → leak between Sensor 1 and Sensor 2
- `|flow2 − flow3| > 1.0` → leak between Sensor 2 and Sensor 3

### Running Tests

```bash
cd server
npm test
```

---

## Frontend Dashboard

Open **http://localhost:3000** after starting the server.

Features:
- Live sensor values (Flow 1, Flow 2, Flow 3, pH)
- System status banner (green = OK, red = leak detected)
- Per-segment leak detection messages
- Chart.js line graph showing the last 20 flow readings
- Auto-refreshes every 5 seconds

---

## ESP32 Firmware

Open `esp32/smart_pipe_monitor.ino` in the Arduino IDE (or PlatformIO).

### Required Libraries (Arduino Library Manager)

- **ArduinoJson** ≥ 6.x
- **WiFi** (bundled with the ESP32 board package)
- **HTTPClient** (bundled with the ESP32 board package)

### Configuration

Edit the constants at the top of the sketch before flashing:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "http://YOUR_SERVER_IP:3000/api/sensors";
```

### Wiring

| Sensor | Signal Pin | VCC | GND |
|--------|-----------|-----|-----|
| Flow Sensor 1 (YF-S201) | GPIO 18 | 5 V | GND |
| Flow Sensor 2 (YF-S201) | GPIO 19 | 5 V | GND |
| Flow Sensor 3 (YF-S201) | GPIO 21 | 5 V | GND |
| pH Sensor Module | GPIO 34 | 3.3 V | GND |

> **Note:** GPIO 34 is ADC1. Avoid ADC2 pins when WiFi is active on ESP32.