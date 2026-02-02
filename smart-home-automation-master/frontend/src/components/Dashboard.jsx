import React from "react";
import "../App.css";

import HeaderBar from "./HeaderBar";
import KpiRow from "./KpiRow";
import EnergyChart from "./EnergyChart";
import DevicesPanel from "./DevicesPanel";
import CommandPanel from "./CommandPanel";
import PowerConsumptionStats from "./PowerConsumptionStats";
import DailyEnergyComparison from "./DailyEnergyComparison";

import { useSensors } from "../hooks/useSensors";
import { useHistory } from "../hooks/useHistory";
import { useDevices } from "../hooks/useDevices";
import { useDevicePowerHistory } from "../hooks/useDevicePowerHistory";

import { calculateDevicePowerStats } from "../utils/powerAnalysis";
import { computeOnHoursPerDevice } from "../utils/onHours";

import { LLM_API } from "../lib/apiClient";

export default function Dashboard() {
    const { sensors, loading: sensorsLoading } = useSensors();
    const { history, loading: historyLoading } = useHistory(200);
    const { devices, loading: devicesLoading, updateDevice } = useDevices();

    // Optional: if you're using this hook for deeper analytics/graphs
    const powerAnalysis = useDevicePowerHistory(history, devices);

    // Total power: prefer backend sensor, else compute from devices' rated power
    const backendPower = sensors?.power_total_kw;
    let computedPower = null;
    if (!backendPower && devices?.length) {
        computedPower = devices
            .filter((d) => d.state?.on)
            .reduce(
                (sum, d) => sum + (d.metadata?.rated_power_kw || d.power_kw || 0),
                0
            );
    }
    const totalPower = backendPower ?? computedPower ?? 0;

    // Current power capacity / stats across all devices
    const powerStats = calculateDevicePowerStats(devices || []);

    const onHoursPerDevice = computeOnHoursPerDevice(history || []);

    const handleToggleDevice = async (device) => {
        const currentOn = !!device.state?.on;
        await updateDevice(device.id, { on: !currentOn });
    };

    const handleLogout = async () => {
        try {
            await LLM_API.post('/logout');
        } catch (err) {
            console.error("Logout failed on backend:", err);
        } finally {
            localStorage.removeItem('isAuthenticated');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
    };

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div className="app-shell">
            <HeaderBar user={user} onLogout={handleLogout} />

            {!sensorsLoading && (
                <KpiRow sensors={sensors} devices={devices} />
            )}

            <div className="layout-grid">
                <div className="layout-main">
                    <div className="panel">
                        <h3>Energy & Temperature over Time</h3>
                        {!historyLoading && <EnergyChart history={history} />}
                    </div>

                    {!devicesLoading && (
                        <PowerConsumptionStats
                            devices={devices}
                            totalCurrentPower={powerStats.totalCurrentPower}
                            totalCapacity={powerStats.totalCapacity}
                        />
                    )}

                    {!historyLoading && (
                        <DailyEnergyComparison history={history} />
                    )}

                    <CommandPanel />
                </div>

                <div className="layout-side">
                    {!devicesLoading && (
                        <DevicesPanel
                            devices={devices}
                            totalPower={totalPower}
                            onToggle={handleToggleDevice}
                            onHours={onHoursPerDevice}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
