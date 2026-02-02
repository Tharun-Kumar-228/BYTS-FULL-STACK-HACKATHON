export function groupHistoryByDate(history) {
  const grouped = {};
  
  history.forEach(record => {
    const date = new Date(record.timestamp_iso);
    const dateKey = date.toISOString().split('T')[0];
    
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(record);
  });
  
  return grouped;
}

export function calculateDailyStats(dailyData) {
  if (!dailyData || dailyData.length === 0) return null;
  
  const totalEnergy = dailyData.reduce((sum, record) => {
    return sum + (record.power_total_kw || 0) * (1 / 60);
  }, 0);
  
  const avgPower = dailyData.reduce((sum, record) => sum + (record.power_total_kw || 0), 0) / dailyData.length;
  const maxPower = Math.max(...dailyData.map(r => r.power_total_kw || 0));
  const minPower = Math.min(...dailyData.map(r => r.power_total_kw || 0));
  const avgTemp = dailyData.reduce((sum, record) => sum + (record.avg_temp_c || 0), 0) / dailyData.length;
  
  return {
    energy_kwh: totalEnergy,
    avg_power_kw: avgPower,
    max_power_kw: maxPower,
    min_power_kw: minPower,
    avg_temp_c: avgTemp
  };
}

export function compareWithPrevious(currentDay, previousDay) {
  if (!currentDay || !previousDay) return null;
  
  const energyDiff = currentDay.energy_kwh - previousDay.energy_kwh;
  const energyPct = previousDay.energy_kwh > 0 
    ? (energyDiff / previousDay.energy_kwh) * 100 
    : 0;
  
  const powerDiff = currentDay.avg_power_kw - previousDay.avg_power_kw;
  const tempDiff = currentDay.avg_temp_c - previousDay.avg_temp_c;
  
  return {
    energy_diff_kwh: energyDiff,
    energy_diff_pct: energyPct,
    power_diff_kw: powerDiff,
    temp_diff_c: tempDiff
  };
}

export function calculateDevicePowerStats(devices, ratedCapacity = null) {
  const onDevices = devices.filter(d => d.state?.on);
  
  const totalPower = onDevices.reduce((sum, d) => {
    return sum + (d.metadata?.rated_power_kw || 0);
  }, 0);
  
  const totalCapacity = devices.reduce((sum, d) => {
    return sum + (d.metadata?.rated_power_kw || 0);
  }, 0);
  
  const utilization = totalCapacity > 0 ? (totalPower / totalCapacity) * 100 : 0;
  
  const deviceStats = devices.map(d => ({
    id: d.id,
    name: d.id,
    type: d.type,
    room: d.room,
    isOn: d.state?.on || false,
    ratedPower: d.metadata?.rated_power_kw || 0,
    currentPower: (d.state?.on ? d.metadata?.rated_power_kw : 0) || 0,
    utilization: d.metadata?.rated_power_kw > 0 
      ? ((d.state?.on ? d.metadata?.rated_power_kw : 0) / d.metadata?.rated_power_kw) * 100
      : 0
  }));
  
  return {
    totalCurrentPower: totalPower,
    totalCapacity: totalCapacity,
    overallUtilization: utilization,
    activeDeviceCount: onDevices.length,
    totalDeviceCount: devices.length,
    devices: deviceStats
  };
}
