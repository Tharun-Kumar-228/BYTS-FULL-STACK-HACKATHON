import { useMemo } from "react";
import { groupHistoryByDate, calculateDailyStats, compareWithPrevious } from "../utils/powerAnalysis";

export function useDevicePowerHistory(history, devices) {
  const analysis = useMemo(() => {
    if (!history || history.length === 0 || !devices) {
      return {
        dailyStats: {},
        currentComparison: null,
        devicePowerContribution: {},
        totalCapacity: 0
      };
    }

    const grouped = groupHistoryByDate(history);
    const dates = Object.keys(grouped).sort();

    const dailyStats = {};
    dates.forEach(date => {
      dailyStats[date] = calculateDailyStats(grouped[date]);
    });

    let currentComparison = null;
    if (dates.length >= 2) {
      const today = dates[dates.length - 1];
      const yesterday = dates[dates.length - 2];
      currentComparison = compareWithPrevious(dailyStats[today], dailyStats[yesterday]);
    }

    const totalCapacity = devices.reduce((sum, d) => {
      return sum + (d.metadata?.rated_power_kw || 0);
    }, 0);

    const devicePowerContribution = {};
    devices.forEach(device => {
      const ratedPower = device.metadata?.rated_power_kw || 0;
      const contribution = totalCapacity > 0 ? (ratedPower / totalCapacity) * 100 : 0;
      devicePowerContribution[device.id] = {
        rated_power_kw: ratedPower,
        capacity_contribution_pct: contribution,
        is_on: device.state?.on || false
      };
    });

    return {
      dailyStats,
      currentComparison,
      devicePowerContribution,
      totalCapacity,
      dates
    };
  }, [history, devices]);

  return analysis;
}
