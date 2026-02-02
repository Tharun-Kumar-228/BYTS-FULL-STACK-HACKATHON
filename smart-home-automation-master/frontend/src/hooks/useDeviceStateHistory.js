// src/hooks/useDeviceStateHistory.js
import { useState, useEffect } from "react";
import { SIM_API } from "../lib/apiClient";

export function useDeviceStateHistory(deviceId, fromIso, toIso) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);



  return { samples, loading };
}
