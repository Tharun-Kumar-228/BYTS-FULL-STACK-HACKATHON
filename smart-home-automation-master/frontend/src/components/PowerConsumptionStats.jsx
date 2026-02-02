import React from "react";

export default function PowerConsumptionStats({ devices, totalCurrentPower, totalCapacity }) {
  if (!devices || devices.length === 0) {
    return null;
  }

  const onDevices = devices.filter(d => d.state?.on);
  const utilizationPct = totalCapacity > 0 ? (totalCurrentPower / totalCapacity) * 100 : 0;

  return (
    <div className="panel">
      <h3>Power Consumption by Device</h3>
      
      <div className="power-summary">
        <div className="power-stat">
          <div className="stat-label">Total Power Used</div>
          <div className="stat-value">{totalCurrentPower.toFixed(2)} kW</div>
        </div>
        <div className="power-stat">
          <div className="stat-label">Total Capacity</div>
          <div className="stat-value">{totalCapacity.toFixed(2)} kW</div>
        </div>
        <div className="power-stat">
          <div className="stat-label">Utilization</div>
          <div className="stat-value">{utilizationPct.toFixed(1)}%</div>
        </div>
        <div className="power-stat">
          <div className="stat-label">Active Devices</div>
          <div className="stat-value">{onDevices.length}/{devices.length}</div>
        </div>
      </div>

      <div className="device-power-list">
        {devices.map((device) => {
          const ratedPower = device.metadata?.rated_power_kw || 0;
          const currentPower = device.state?.on ? ratedPower : 0;
          const capacityPct = totalCapacity > 0 ? (ratedPower / totalCapacity) * 100 : 0;
          const utilizationPct = ratedPower > 0 ? (currentPower / ratedPower) * 100 : 0;

          return (
            <div
              key={device.id}
              className={`device-power-item ${device.state?.on ? "active" : "inactive"}`}
            >
              <div className="device-info">
                <div className="device-name">{device.id}</div>
                <div className="device-details">
                  {device.type} · {device.room}
                </div>
              </div>

              <div className="power-metrics">
                <div className="metric">
                  <span className="label">Rated:</span>
                  <span className="value">{ratedPower.toFixed(2)} kW</span>
                </div>
                <div className="metric">
                  <span className="label">Current:</span>
                  <span className="value">{currentPower.toFixed(2)} kW</span>
                </div>
                <div className="metric">
                  <span className="label">Capacity:</span>
                  <span className="value">{capacityPct.toFixed(1)}%</span>
                </div>
                <div className="metric">
                  <span className="label">Usage:</span>
                  <span className="value">{utilizationPct.toFixed(0)}%</span>
                </div>
              </div>

              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${utilizationPct}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
