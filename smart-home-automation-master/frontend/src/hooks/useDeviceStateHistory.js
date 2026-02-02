// src/hooks/useDeviceStateHistory.js
import { useState, useEffect } from "react";
import { SIM_API } from "../lib/apiClient";

export function useDeviceStateHistory(deviceId, fromIso, toIso) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!deviceId) return;
    const params = new URLSearchParams();
    if (fromIso) params.set("from", fromIso);
    if (toIso) params.set("to", toIso);

    SIM_API.get(
      `/sim/devices/${deviceId}/state-history?${params.toString()}`
    )
      .then((res) => setSamples(res.data))
      .finally(() => setLoading(false));
  }, [deviceId, fromIso, toIso]);
  
  return { samples, loading };
}
