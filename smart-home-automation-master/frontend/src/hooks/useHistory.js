import { useState, useEffect, useCallback } from "react";
import { SIM_API } from "../lib/apiClient";

export function useHistory(limit = 200) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.userId;
      const res = await SIM_API.get("/sim/history", { params: { limit, userId } });
      setHistory(res.data);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchHistory();
    const id = setInterval(fetchHistory, 5000);
    return () => clearInterval(id);
  }, [fetchHistory]);

  return { history, loading };
}
