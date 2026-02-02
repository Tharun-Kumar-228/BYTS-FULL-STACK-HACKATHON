// src/components/DevicesPanel.jsx
import React from "react";

export default function DevicesPanel({
  devices,
  totalPower,
  onToggle,
  onHours = {},
}) {
  return (
    <div className="panel">
      <h3>Devices</h3>
      <div className="devices-grid">
        {devices.map((d) => {
          const currentKw = d.state?.on ? d.power_kw || 0 : 0;
          const contributionPct =
            totalPower && currentKw
              ? (currentKw / totalPower) * 100
              : null;

          // hours this device was ON in the current history window
          const hoursOn = onHours[d.id] || 0;

          return (
            <div
              key={d.id}
              className={`device-card ${d.state?.on ? "on" : "off"}`}
            >
              <div className="device-name">{d.id}</div>
              <div className="device-type">
                {d.type} · {d.room}
              </div>

              <div className="device-state">
                {/* Example final string:
                   On · 0.06 kW · 12% of total · 3.4 h ON in window */}
                {d.state?.on ? "On" : "Off"}
                {currentKw ? ` · ${currentKw.toFixed(2)} kW` : ""}
                {contributionPct != null &&
                  ` · ${contributionPct.toFixed(0)}% of total`}
                {hoursOn > 0 &&
                  ` · ${hoursOn.toFixed(1)} h ON in window`}
              </div>

              <button
                onClick={() => onToggle(d)}
                className="device-button"
              >
                {d.state?.on ? "Turn Off" : "Turn On"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
