// src/utils/energy.js

// history items must have either timestamp_iso (ISO string) or timestamp (seconds)
export function computeDailyEnergy(history) {
  if (!history || history.length < 2) return {};

  const byDay = {};

  for (let i = 0; i < history.length - 1; i++) {
    const a = history[i];
    const b = history[i + 1];

    const tA = new Date(a.timestamp_iso || a.timestamp * 1000);
    const tB = new Date(b.timestamp_iso || b.timestamp * 1000);

    const day = tA.toISOString().slice(0, 10); // YYYY-MM-DD
    const deltaHours = (tB - tA) / (1000 * 60 * 60);
    if (deltaHours <= 0) continue;

    const powerKw = a.power_total_kw ?? 0;
    const energyKwh = powerKw * deltaHours;

    if (!byDay[day]) {
      byDay[day] = { energy_kwh: 0, max_power_kw: 0 };
    }
    byDay[day].energy_kwh += energyKwh;
    byDay[day].max_power_kw = Math.max(byDay[day].max_power_kw, powerKw);
  }

  return byDay; // { "2025-12-18": { energy_kwh, max_power_kw } }
}
