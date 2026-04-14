'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { ACTIVE_CITY, type Neighborhood } from '@/lib/city-config';

interface WeatherData {
  temp: number;
  icon: string;
}

const FALLBACK_WEATHER: WeatherData = { temp: 24, icon: '⛅' };

const WEATHER_ICONS: Record<string, string> = {
  clear: '☀️',
  clouds: '⛅',
  rain: '🌧️',
  drizzle: '🌦️',
  thunderstorm: '⛈️',
};

interface CityGreetingProps {
  activeHood?: Neighborhood | null;
}

export default function CityGreeting({ activeHood }: CityGreetingProps) {
  const { language } = useLanguage();
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    const { lat, lng } = ACTIVE_CITY.weatherLocation;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(ACTIVE_CITY.timezone)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data?.current) {
          const temp = Math.round(data.current.temperature_2m);
          const code = data.current.weather_code;
          let condition = 'clouds';
          if (code <= 1) condition = 'clear';
          else if (code <= 3) condition = 'clouds';
          else if (code >= 51 && code <= 55) condition = 'drizzle';
          else if (code >= 61 && code <= 65) condition = 'rain';
          else if (code >= 95) condition = 'thunderstorm';
          setWeather({ temp, icon: WEATHER_ICONS[condition] || '⛅' });
        } else {
          setWeather(FALLBACK_WEATHER);
        }
      })
      .catch(() => {
        setWeather(FALLBACK_WEATHER);
      });
  }, []);

  const locationName = activeHood ? activeHood.name : ACTIVE_CITY.name;

  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xl font-bold text-stone-900 dark:text-white tracking-tight">
        {language === 'es' ? `En ${locationName}` : `In ${locationName}`}
      </h2>
      {weather && (
        <span className="text-sm text-stone-500 dark:text-gray-400 flex items-center gap-1">
          {weather.icon} {weather.temp}°
        </span>
      )}
    </div>
  );
}
