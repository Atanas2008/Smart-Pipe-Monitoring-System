/*
 * Smart Pipe Monitoring System – ESP32 Firmware
 *
 * Hardware:
 *   - ESP32 development board
 *   - 3× YF-S201 water flow sensors  (signal pins: FLOW_PIN_1/2/3)
 *   - 1× analog pH sensor module     (signal pin:  PH_PIN)
 *
 * Reads all sensors every SEND_INTERVAL_MS milliseconds and POSTs the
 * values as JSON to the configured backend server.
 *
 * Dependencies (install via Arduino Library Manager):
 *   - ArduinoJson  ≥ 6.x
 *
 * Configuration:
 *   Copy esp32/config.h.example to esp32/config.h and fill in your
 *   WiFi credentials and server URL.  config.h is git-ignored.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"   // WiFi credentials & SERVER_URL (git-ignored)

// How often to send data (milliseconds)
const unsigned long SEND_INTERVAL_MS = 5000;

// GPIO pins
const int FLOW_PIN_1 = 18;
const int FLOW_PIN_2 = 19;
const int FLOW_PIN_3 = 21;
const int PH_PIN     = 34;   // ADC1 channel – do NOT use ADC2 when WiFi is active

// YF-S201 calibration: pulses per litre
const float PULSES_PER_LITRE = 450.0f;

// pH sensor calibration
// Map the raw ADC reading (0–4095 on a 3.3 V, 12-bit ADC) to a pH value.
// Adjust VOLTAGE_AT_PH7 and MV_PER_PH for your specific module.
const float ADC_REF_VOLTAGE  = 3.3f;
const float ADC_RESOLUTION   = 4095.0f;
const float VOLTAGE_AT_PH7   = 1.65f;  // mid-point voltage for pH 7
const float MV_PER_PH        = 0.18f;  // sensitivity (V per pH unit)

// ── Pulse counters (volatile – modified in ISRs) ──────────────────────────────
volatile uint32_t pulseCount1 = 0;
volatile uint32_t pulseCount2 = 0;
volatile uint32_t pulseCount3 = 0;

void IRAM_ATTR onFlow1() { pulseCount1++; }
void IRAM_ATTR onFlow2() { pulseCount2++; }
void IRAM_ATTR onFlow3() { pulseCount3++; }

// ── Timing ────────────────────────────────────────────────────────────────────
unsigned long lastSendTime  = 0;
unsigned long lastCountTime = 0;

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Flow sensor pins
  pinMode(FLOW_PIN_1, INPUT_PULLUP);
  pinMode(FLOW_PIN_2, INPUT_PULLUP);
  pinMode(FLOW_PIN_3, INPUT_PULLUP);

  attachInterrupt(digitalPinToInterrupt(FLOW_PIN_1), onFlow1, RISING);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN_2), onFlow2, RISING);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN_3), onFlow3, RISING);

  // ADC for pH sensor
  analogReadResolution(12);

  // Connect to WiFi
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());

  lastCountTime = millis();
  lastSendTime  = millis();
}

// ── Flow rate calculation ─────────────────────────────────────────────────────
/**
 * Snapshot the pulse counters, reset them, then convert to L/min.
 * @param elapsedMs  Time elapsed since the last snapshot (milliseconds)
 */
void readFlowRates(unsigned long elapsedMs,
                   float& flow1, float& flow2, float& flow3) {
  // Atomically capture and reset counters
  noInterrupts();
  uint32_t p1 = pulseCount1; pulseCount1 = 0;
  uint32_t p2 = pulseCount2; pulseCount2 = 0;
  uint32_t p3 = pulseCount3; pulseCount3 = 0;
  interrupts();

  float elapsedMin = elapsedMs / 60000.0f;
  flow1 = (p1 / PULSES_PER_LITRE) / elapsedMin;
  flow2 = (p2 / PULSES_PER_LITRE) / elapsedMin;
  flow3 = (p3 / PULSES_PER_LITRE) / elapsedMin;
}

// ── pH calculation ────────────────────────────────────────────────────────────
float readPh() {
  // Average several samples to reduce noise
  const int SAMPLES = 10;
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogRead(PH_PIN);
    delay(10);
  }
  float adcValue  = sum / (float)SAMPLES;
  float voltage   = adcValue * (ADC_REF_VOLTAGE / ADC_RESOLUTION);
  float ph        = 7.0f + ((voltage - VOLTAGE_AT_PH7) / MV_PER_PH);
  return ph;
}

// ── HTTP POST ─────────────────────────────────────────────────────────────────
void sendData(float flow1, float flow2, float flow3, float ph) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected – skipping POST");
    return;
  }

  // Build JSON payload
  StaticJsonDocument<128> doc;
  doc["flow1"] = serialized(String(flow1, 2));
  doc["flow2"] = serialized(String(flow2, 2));
  doc["flow3"] = serialized(String(flow3, 2));
  doc["ph"]    = serialized(String(ph,    2));

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.printf("POST %s  →  HTTP %d\n", SERVER_URL, httpCode);
    Serial.printf("  flow1=%.2f  flow2=%.2f  flow3=%.2f  ph=%.2f\n",
                  flow1, flow2, flow3, ph);
  } else {
    Serial.printf("POST failed: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();
}

// ── Main loop ─────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Reconnect to WiFi if the connection dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost – reconnecting…");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long reconnectStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - reconnectStart < 10000) {
      delay(500);
      Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("\nReconnected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
      Serial.println("\nReconnect failed – will retry next cycle");
      return;
    }
  }

  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    unsigned long elapsed = now - lastCountTime;
    lastCountTime = now;
    lastSendTime  = now;

    float flow1, flow2, flow3;
    readFlowRates(elapsed, flow1, flow2, flow3);
    float ph = readPh();

    sendData(flow1, flow2, flow3, ph);
  }
}
