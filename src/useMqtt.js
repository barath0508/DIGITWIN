// Replace useMqtt.js entirely with this
import { useState, useEffect, useRef } from 'react';

const THINGSPEAK_CHANNEL = import.meta.env.VITE_THINGSPEAK_CHANNEL;
const THINGSPEAK_API_KEY = import.meta.env.VITE_THINGSPEAK_API_KEY;
const POLL_INTERVAL = 20000; // every 20s matches ESP32 publish rate

const fetchThingSpeak = async () => {
  const url = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL}/feeds/last.json?api_key=${THINGSPEAK_API_KEY}`;
  const res  = await fetch(url);
  const json = await res.json();

  // ThingSpeak fields map to what ESP32 sends:
  // field1 = temp, field2 = hum, field3 = co2, field4 = co
  return {
    node: 'thermal_plant_01',
    timestamp: json.created_at,
    dht11: {
      temp:     parseFloat(json.field1),
      humidity: parseFloat(json.field2),
    },
    bmp180:  { pressure: 1013.25 },
    mpu6050: { ax: 0, ay: 0, az: 9.8 },
    noise: 500,
    flow:  2.5,
    co2: parseFloat(json.field3),
    co:  parseFloat(json.field4),
  };
};

const useMqtt = () => {
  const [data, setData]           = useState(null);
  const [connected, setConnected] = useState(false);
  const simTickRef                = useRef(0);

  useEffect(() => {
    // Try ThingSpeak immediately on mount
    const fetchAndSet = async () => {
      try {
        const live = await fetchThingSpeak();
        setData(live);
        setConnected(true);
        console.log('✅ ThingSpeak live data:', live);
      } catch (e) {
        console.warn('ThingSpeak fetch failed, using simulation:', e);
        setConnected(false);
      }
    };

    fetchAndSet(); // immediate first fetch

    const interval = setInterval(fetchAndSet, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return { data, connected };
};

export default useMqtt;