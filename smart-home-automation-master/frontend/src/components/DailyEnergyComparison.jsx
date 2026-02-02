import React, { useMemo } from "react";
import { groupHistoryByDate, calculateDailyStats, compareWithPrevious } from "../utils/powerAnalysis";

export default function DailyEnergyComparison({ history }) {
  const comparison = useMemo(() => {
    if (!history || history.length === 0) return null;

    const grouped = groupHistoryByDate(history);
    const dates = Object.keys(grouped).sort();

    if (dates.length < 2) return null;

    const stats = {};
    dates.forEach(date => {
      stats[date] = calculateDailyStats(grouped[date]);
    });

    const today = dates[dates.length - 1];
    const yesterday = dates[dates.length - 2];
    const dayBeforeYesterday = dates.length >= 3 ? dates[dates.length - 3] : null;

    const todayStats = stats[today];
    const yesterdayStats = stats[yesterday];
    const dayBeforeStats = dayBeforeYesterday ? stats[dayBeforeYesterday] : null;

    const todayVsYesterday = compareWithPrevious(todayStats, yesterdayStats);
    const yesterdayVsPreviousDay = dayBeforeStats ? compareWithPrevious(yesterdayStats, dayBeforeStats) : null;

    return {
      today: { date: today, stats: todayStats },
      yesterday: { date: yesterday, stats: yesterdayStats },
      dayBefore: dayBeforeStats ? { date: dayBeforeYesterday, stats: dayBeforeStats } : null,
      todayVsYesterday,
      yesterdayVsPreviousDay,
      allDates: dates
    };
  }, [history]);

  if (!comparison) {
    return (
      <div className="panel">
        <h3>Daily Energy Comparison</h3>
        <p>Insufficient data for comparison</p>
      </div>
    );
  }

  const { today, yesterday, dayBefore, todayVsYesterday, yesterdayVsPreviousDay } = comparison;

  return (
    <div className="panel">
      <h3>Daily Energy Comparison</h3>

      <div className="comparison-grid">
        <div className="comparison-card">
          <div className="comparison-date">Today</div>
          <div className="comparison-metric">
            <div className="metric-label">Total Energy</div>
            <div className="metric-value">{today.stats.energy_kwh.toFixed(2)} kWh</div>
          </div>
          <div className="comparison-metric">
            <div className="metric-label">Avg Power</div>
            <div className="metric-value">{today.stats.avg_power_kw.toFixed(2)} kW</div>
          </div>
          <div className="comparison-metric">
            <div className="metric-label">Max Power</div>
            <div className="metric-value">{today.stats.max_power_kw.toFixed(2)} kW</div>
          </div>
          <div className="comparison-metric">
            <div className="metric-label">Avg Temp</div>
            <div className="metric-value">{today.stats.avg_temp_c.toFixed(1)} °C</div>
          </div>
        </div>

        <div className="comparison-card">
          <div className="comparison-date">Yesterday</div>
          <div className="comparison-metric">
            <div className="metric-label">Total Energy</div>
            <div className="metric-value">{yesterday.stats.energy_kwh.toFixed(2)} kWh</div>
          </div>
          <div className="comparison-metric">
            <div className="metric-label">Avg Power</div>
            <div className="metric-value">{yesterday.stats.avg_power_kw.toFixed(2)} kW</div>
          </div>
          <div className="comparison-metric">
            <div className="metric-label">Max Power</div>
            <div className="metric-value">{yesterday.stats.max_power_kw.toFixed(2)} kW</div>
          </div>
          <div className="comparison-metric">
            <div className="metric-label">Avg Temp</div>
            <div className="metric-value">{yesterday.stats.avg_temp_c.toFixed(1)} °C</div>
          </div>
        </div>

        {dayBefore && (
          <div className="comparison-card">
            <div className="comparison-date">Day Before</div>
            <div className="comparison-metric">
              <div className="metric-label">Total Energy</div>
              <div className="metric-value">{dayBefore.stats.energy_kwh.toFixed(2)} kWh</div>
            </div>
            <div className="comparison-metric">
              <div className="metric-label">Avg Power</div>
              <div className="metric-value">{dayBefore.stats.avg_power_kw.toFixed(2)} kW</div>
            </div>
            <div className="comparison-metric">
              <div className="metric-label">Max Power</div>
              <div className="metric-value">{dayBefore.stats.max_power_kw.toFixed(2)} kW</div>
            </div>
            <div className="comparison-metric">
              <div className="metric-label">Avg Temp</div>
              <div className="metric-value">{dayBefore.stats.avg_temp_c.toFixed(1)} °C</div>
            </div>
          </div>
        )}
      </div>

      <div className="comparison-changes">
        <h4>Today vs Yesterday</h4>
        <div className="change-metrics">
          <div className={`change-metric ${todayVsYesterday.energy_diff_kwh >= 0 ? "increase" : "decrease"}`}>
            <span className="label">Energy Difference:</span>
            <span className="value">
              {todayVsYesterday.energy_diff_kwh >= 0 ? "+" : ""}{todayVsYesterday.energy_diff_kwh.toFixed(2)} kWh
              ({todayVsYesterday.energy_diff_pct >= 0 ? "+" : ""}{todayVsYesterday.energy_diff_pct.toFixed(1)}%)
            </span>
          </div>
          <div className={`change-metric ${todayVsYesterday.power_diff_kw >= 0 ? "increase" : "decrease"}`}>
            <span className="label">Avg Power Difference:</span>
            <span className="value">
              {todayVsYesterday.power_diff_kw >= 0 ? "+" : ""}{todayVsYesterday.power_diff_kw.toFixed(2)} kW
            </span>
          </div>
          <div className="change-metric">
            <span className="label">Temperature Difference:</span>
            <span className="value">
              {todayVsYesterday.temp_diff_c >= 0 ? "+" : ""}{todayVsYesterday.temp_diff_c.toFixed(1)} °C
            </span>
          </div>
        </div>
      </div>

      {yesterdayVsPreviousDay && (
        <div className="comparison-changes">
          <h4>Yesterday vs Day Before</h4>
          <div className="change-metrics">
            <div className={`change-metric ${yesterdayVsPreviousDay.energy_diff_kwh >= 0 ? "increase" : "decrease"}`}>
              <span className="label">Energy Difference:</span>
              <span className="value">
                {yesterdayVsPreviousDay.energy_diff_kwh >= 0 ? "+" : ""}{yesterdayVsPreviousDay.energy_diff_kwh.toFixed(2)} kWh
                ({yesterdayVsPreviousDay.energy_diff_pct >= 0 ? "+" : ""}{yesterdayVsPreviousDay.energy_diff_pct.toFixed(1)}%)
              </span>
            </div>
            <div className={`change-metric ${yesterdayVsPreviousDay.power_diff_kw >= 0 ? "increase" : "decrease"}`}>
              <span className="label">Avg Power Difference:</span>
              <span className="value">
                {yesterdayVsPreviousDay.power_diff_kw >= 0 ? "+" : ""}{yesterdayVsPreviousDay.power_diff_kw.toFixed(2)} kW
              </span>
            </div>
            <div className="change-metric">
              <span className="label">Temperature Difference:</span>
              <span className="value">
                {yesterdayVsPreviousDay.temp_diff_c >= 0 ? "+" : ""}{yesterdayVsPreviousDay.temp_diff_c.toFixed(1)} °C
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
