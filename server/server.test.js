'use strict';

const request = require('supertest');
const { app, detectLeaks } = require('./server');

describe('GET /api/status', () => {
  it('returns JSON with flow and ph fields', async () => {
    const res = await request(app).get('/api/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('leaks');
  });
});

describe('POST /api/sensors', () => {
  it('stores valid sensor data and returns success', async () => {
    const payload = { flow1: 10.2, flow2: 7.9, flow3: 7.8, ph: 7.3 };
    const res = await request(app).post('/api/sensors').send(payload);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.received.flow1).toBe(10.2);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/api/sensors').send({ flow1: 5 });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when fields are not numbers', async () => {
    const res = await request(app)
      .post('/api/sensors')
      .send({ flow1: 'x', flow2: 7.9, flow3: 7.8, ph: 7.3 });
    expect(res.statusCode).toBe(400);
  });
});

describe('detectLeaks', () => {
  it('detects leak between sensor 1 and 2 when difference exceeds threshold', () => {
    const result = detectLeaks({ flow1: 10, flow2: 5, flow3: 5, ph: 7 });
    expect(result.leak1_2).toBe(true);
    expect(result.leak2_3).toBe(false);
  });

  it('detects leak between sensor 2 and 3 when difference exceeds threshold', () => {
    const result = detectLeaks({ flow1: 10, flow2: 10, flow3: 5, ph: 7 });
    expect(result.leak1_2).toBe(false);
    expect(result.leak2_3).toBe(true);
  });

  it('reports no leaks when differences are within threshold', () => {
    const result = detectLeaks({ flow1: 10, flow2: 10, flow3: 10, ph: 7 });
    expect(result.leak1_2).toBe(false);
    expect(result.leak2_3).toBe(false);
  });

  it('handles null values gracefully', () => {
    const result = detectLeaks({ flow1: null, flow2: null, flow3: null, ph: null });
    expect(result.leak1_2).toBe(false);
    expect(result.leak2_3).toBe(false);
  });
});
