// src/components/EnergyChart.jsx
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function EnergyChart({ history }) {
  const data = history.map((h) => ({
    time: new Date(h.timestamp_iso || h.timestamp * 1000).toLocaleTimeString(),
    power: h.power_total_kw,
    temp: h.avg_temp_c,
  }));

  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={20} />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="power"
            stroke="#8884d8"
            strokeWidth={2}
            dot={false}
            name="Power (kW)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="temp"
            stroke="#82ca9d"
            dot={false}
            name="Avg Temp (°C)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
