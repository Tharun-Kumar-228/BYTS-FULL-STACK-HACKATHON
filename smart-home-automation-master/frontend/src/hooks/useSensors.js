import { useState, useEffect, useCallback } from "react";
import { SIM_API } from "../lib/apiClient";

export function useSensors() {
  const [sensors, setSensors] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSensors = useCallback(async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.userId;
      const res = await SIM_API.get("/sim/sensors", { params: { userId } });

      const sensorArray = Array.isArray(res.data) ? res.data : [];

      const powerSensor = sensorArray.find(s => s.type === "power_total");
      const tempSensors = sensorArray.filter(s => s.type === "temperature");

      const power_total_kw = powerSensor?.value ?? null;

      let temp_outdoor_c = null;
      if (tempSensors.length > 0) {
        const avgTemp = tempSensors.reduce((sum, s) => sum + (s.value || 0), 0) / tempSensors.length;
        temp_outdoor_c = avgTemp;
      }

      setSensors({
        power_total_kw,
        temp_outdoor_c,
        mode: "normal"
      });
    } catch (err) {
      console.error("Error fetching sensors:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSensors();
    const id = setInterval(fetchSensors, 4000);
    return () => clearInterval(id);
  }, [fetchSensors]);

  return { sensors, loading };
}
