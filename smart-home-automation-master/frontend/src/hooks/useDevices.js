import { useState, useEffect, useCallback } from "react";
import { SIM_API } from "../lib/apiClient";

export function useDevices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDevices = useCallback(async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.userId;
      const res = await SIM_API.get("/sim/devices", { params: { userId } });
      setDevices(res.data);
    } catch (err) {
      console.error("Error fetching devices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const id = setInterval(fetchDevices, 5000);
    return () => clearInterval(id);
  }, [fetchDevices]);

  const updateDevice = async (deviceId, patch) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user.userId;
    await SIM_API.post(`/sim/devices/${deviceId}`, { ...patch, userId });
    fetchDevices();
  };

  return { devices, loading, updateDevice };
}
