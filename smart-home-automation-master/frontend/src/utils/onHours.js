// src/utils/onHours.js
export function computeOnHoursPerDevice(history) {
  const resultMs = {};

  if (!history || history.length < 2) return {};

  for (let i = 0; i < history.length - 1; i++) {
    const a = history[i];
    const b = history[i + 1];

    const tA = new Date(a.timestamp_iso || a.timestamp * 1000);
    const tB = new Date(b.timestamp_iso || b.timestamp * 1000);
    const deltaMs = tB - tA;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) continue;

    // IMPORTANT: history item must have a.devices
    if (!Array.isArray(a.devices)) continue;

    for (const dev of a.devices) {
      if (dev?.state?.on) {
        const id = dev.id;
        if (!id) continue;
        resultMs[id] = (resultMs[id] || 0) + deltaMs;
      }
    }
  }

  const resultHours = {};
  for (const [id, ms] of Object.entries(resultMs)) {
    resultHours[id] = ms / (1000 * 60 * 60); // ms → h
  }
  return resultHours;
}
