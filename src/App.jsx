import React, { useState, useEffect, useRef } from 'react';
import { Activity, Thermometer, Wind, Waves, Gauge, AlertTriangle, Wifi, WifiOff, HardDrive, Maximize2, Minimize2 } from 'lucide-react';
import useMqtt from './useMqtt';
import SensorCard from './components/SensorCard';
import ThreeScene from './components/ThreeScene';
import LandingPage from './components/LandingPage';
import DashboardFX from './components/DashboardFX';

function App() {
  const { data, connected } = useMqtt();
  const [showLanding, setShowLanding] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const modelRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Lock/unlock body scroll for landing
  useEffect(() => {
    if (showLanding) document.body.classList.add('landing');
    else document.body.classList.remove('landing');
    return () => document.body.classList.remove('landing');
  }, [showLanding]);

  // Fullscreen API
  const toggleFullscreen = () => {
    const el = modelRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute status for different sensors based on thresholds
  const getStatus = (value, warning, danger) => {
    if (value >= danger) return 'danger';
    if (value >= warning) return 'warning';
    return 'success';
  };

  const getCO2Status = data ? getStatus(data.co2, 800, 1000) : 'normal';
  const getCOStatus = data ? getStatus(data.co, 20, 50) : 'normal';
  const getNoiseStatus = data ? getStatus(data.noise, 600, 700) : 'normal';
  const getTempStatus = data ? getStatus(data.dht11.temp, 30, 35) : 'normal';

  if (showLanding) return <LandingPage onEnter={() => setShowLanding(false)} />;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-200 font-sans relative">
      <DashboardFX />

      {/* Header */}
      <header className="flex justify-between items-end px-4 md:px-8 pt-6 pb-4 border-b border-slate-800/60 relative z-20">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">
              Environmental Digital Twin Dashboard
            </h1>
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <p className="text-slate-400 text-sm flex items-center gap-2">
            <HardDrive size={14} /> Node Monitor: <span className="text-slate-200 font-semibold">{data?.node || 'Scanning...'}</span>
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm backdrop-blur-md transition-colors duration-500 ${
          connected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          : data    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {connected ? <><Wifi size={16} /><span className="font-medium tracking-wide">MQTT ONLINE</span></>
            : data   ? <><Activity size={16} /><span className="font-medium tracking-wide">SIMULATING</span></>
                     : <><WifiOff size={16} /><span className="font-medium tracking-wide">CONNECTING...</span></>}
          <div className={`w-2 h-2 rounded-full ml-1 ${
            connected ? 'bg-emerald-500 animate-pulse' : data ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse'
          }`} />
        </div>
      </header>

      {/* Full-width 3D Model */}
      <div ref={modelRef} className="relative w-full z-10 bg-[#020817]" style={{ height: fullscreen ? '100vh' : '75vh' }}>
        {/* Top-left label */}
        <div className="absolute top-4 left-4 z-20 glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-300 border-slate-700/50">
          <Activity size={12} className="text-blue-400" />
          3D SPATIAL VIEW
        </div>
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 z-20 glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-300 border-slate-700/50 hover:border-blue-500/50 hover:text-blue-400 transition-all"
        >
          {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {fullscreen ? 'EXIT' : 'FULLSCREEN'}
        </button>
        <ThreeScene data={data} />
        {!connected && !data && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-30 flex items-center justify-center">
            <div className="flex flex-col items-center p-6 glass-panel rounded-2xl border border-red-500/30 text-red-400">
              <AlertTriangle size={48} className="mb-4 animate-pulse opacity-80" />
              <h3 className="text-xl font-bold mb-2">Initialising...</h3>
              <p className="text-sm text-slate-400">Starting simulation — attempting MQTT connection...</p>
            </div>
          </div>
        )}
      </div>

      {/* Sensor Cards — free scrolling grid below the model */}
      <div className="px-4 md:px-8 py-8 relative z-10">
        <h2 className="text-[11px] font-bold text-slate-400 tracking-[0.25em] uppercase mb-6 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Live Telemetry · Building
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <SensorCard
            title="Temperature"
            value={data?.dht11?.temp?.toFixed(1) || '--'}
            unit="°C" icon={Thermometer}
            percentage={data ? (data.dht11.temp / 50) * 100 : 0}
            status={getTempStatus}
            desc="Ambient air temp across floors. Above 30 °C triggers HVAC cooling override."
          />
          <SensorCard
            title="Humidity"
            value={data?.dht11?.humidity?.toFixed(1) || '--'}
            unit="%" icon={Waves}
            percentage={data?.dht11?.humidity || 0}
            status="success"
            desc="Relative humidity. Optimal 40–60 % for occupant comfort and equipment safety."
          />
          <SensorCard
            title="Barometric Pressure"
            value={data?.bmp180?.pressure?.toFixed(2) || '--'}
            unit="hPa" icon={Gauge}
            percentage={data ? ((data.bmp180.pressure - 900) / 200) * 100 : 0}
            status="normal"
            desc="Floor-level pressure differential used to balance ventilation across zones."
          />
          <SensorCard
            title="Noise Level"
            value={data?.noise || '--'}
            unit="mV" icon={Activity}
            percentage={data ? (data.noise / 1024) * 100 : 0}
            status={getNoiseStatus}
            desc="Acoustic output. Spikes above 700 mV indicate machinery or crowd noise events."
          />
          <SensorCard
            title="Flow Rate"
            value={data?.flow?.toFixed(1) || '--'}
            unit="L/min" icon={Wind}
            percentage={data ? (data.flow / 10) * 100 : 0}
            status="normal"
            desc="HVAC air-flow and plumbing water-flow. Low readings flag blockages or pump faults."
          />
          <SensorCard
            title="CO₂ Level"
            value={data?.co2 || '--'}
            unit="ppm" icon={AlertTriangle}
            percentage={data ? (data.co2 / 2000) * 100 : 0}
            status={getCO2Status}
            desc="Above 800 ppm ventilation increases; above 1000 ppm triggers occupancy alert."
          />
          <SensorCard
            title="CO Level"
            value={data?.co || '--'}
            unit="ppm" icon={AlertTriangle}
            percentage={data ? (data.co / 100) * 100 : 0}
            status={getCOStatus}
            desc="Carbon monoxide from combustion. Above 50 ppm triggers immediate evacuation."
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 md:px-8 pb-6 flex justify-between items-center text-xs text-slate-500 font-medium z-20 relative">
        <div className="flex items-center gap-2">
          <span>Last Update:</span>
          {data ? (
            <span className="text-slate-300 bg-slate-800/50 px-2 py-1 rounded">
              {new Date(data.timestamp).toLocaleTimeString() || '--'}
            </span>
          ) : (
            <span className="text-slate-500 bg-slate-900/50 px-2 py-1 rounded">Waiting for data...</span>
          )}
        </div>
        <div>System Time: {currentTime}</div>
      </footer>
    </div>
  );
}

export default App;
