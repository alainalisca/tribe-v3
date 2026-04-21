'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { ACTIVE_CITY } from '@/lib/city-config';

interface WeatherData {
  temp: number;
  condition: string;
}

const FALLBACK_WEATHER: WeatherData = { temp: 24, condition: 'clouds' };

const WEATHER_ICONS: Record<string, string> = {
  clear: '☀️',
  clouds: '⛅',
  rain: '🌧️',
  drizzle: '🌦️',
  thunderstorm: '⛈️',
};

// Maps the open-meteo weather_code to a semantic condition key that matches
// our translation namespace. Keep these keys in sync with messages/*.json
// under the "weather" namespace.
function codeToCondition(code: number): string {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'clouds';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code >= 61 && code <= 65) return 'rain';
  if (code >= 95) return 'thunderstorm';
  return 'clouds';
}

export default function WeatherBar() {
  const t = useTranslations('weather');
  const [weather, setWeather] = useState<WeatherData>(FALLBACK_WEATHER);

  useEffect(() => {
    const { lat, lng } = ACTIVE_CITY.weatherLocation;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(ACTIVE_CITY.timezone)}`;
    // QA-10: logging was silent before — if Al sees the 24°C fallback it means
    // this block logged a warning. Check the browser console (and the Capacitor
    // webview console on mobile) for the exact failure mode.
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          console.warn('[WeatherBar] fetch non-OK', res.status, url);
          return null;
        }
        const data = await res.json();
        if (!data?.current) {
          console.warn('[WeatherBar] unexpected response shape', data);
          return null;
        }
        const temp = Math.round(data.current.temperature_2m);
        setWeather({ temp, condition: codeToCondition(data.current.weather_code) });
        return null;
      })
      .catch((err) => {
        console.warn('[WeatherBar] fetch failed, using fallback', err);
      });
  }, []);

  return (
    <div className="flex items-center gap-2 mx-4 mt-1.5 mb-1 px-3 py-2 bg-blue-500/[0.08] border border-blue-500/[0.15] rounded-xl">
      <span className="text-lg">{WEATHER_ICONS[weather.condition] || '⛅'}</span>
      <p className="flex-1 text-xs text-stone-500 dark:text-gray-400">
        <span className="font-bold text-stone-900 dark:text-white">{weather.temp}°C</span>
        {' · '}
        {t(weather.condition)}
      </p>
    </div>
  );
}
