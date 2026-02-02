// src/components/KpiRow.jsx
import React from "react";

export default function KpiRow({ sensors, devices }) {
  // Backend readings
  const backendPower = sensors?.power_total_kw;
  const backendTemp = sensors?.temp_outdoor_c;
  const mode = sensors?.mode ?? "normal";

  // Fallback: compute total power from device list
  let computedPower = null;
  if (!backendPower && devices?.length) {
    computedPower = devices
      .filter((d) => d.state?.on)
      .reduce((sum, d) => sum + (d.power_kw || 0), 0);
  }

  const totalPower = backendPower ?? computedPower;
  const temp = backendTemp ?? null;

  return (
    <div className="kpi-row">
      <div className="kpi-card">
        <div className="kpi-label">Total Power</div>
        <div className="kpi-value">
          {totalPower != null ? totalPower.toFixed(2) : "--"} kW
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Outdoor Temp</div>
        <div className="kpi-value">
          {temp != null ? temp.toFixed(1) : "--"} °C
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Mode</div>
        <div className="kpi-value">{mode}</div>
      </div>
    </div>
  );
}
