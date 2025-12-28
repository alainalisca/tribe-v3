// Haversine formula to calculate distance between two coordinates
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers (changed from miles)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function formatDistance(km: number, language: string = 'en', unit: 'km' | 'mi' = 'km'): string {
  let value: number;
  let unitLabel: string;

  if (unit === 'mi') {
    // Convert km to miles (1 km = 0.621371 miles)
    value = km * 0.621371;
    unitLabel = 'mi';
  } else {
    value = km;
    unitLabel = 'km';
  }

  // Show one decimal for distances under 10, otherwise round
  let formatted: string;
  if (value < 1) {
    // Show as meters for very short distances
    if (unit === 'km') {
      const meters = Math.round(km * 1000);
      formatted = `${meters} m`;
      return formatted;
    } else {
      formatted = value.toFixed(1);
    }
  } else if (value < 10) {
    formatted = value.toFixed(1);
  } else {
    formatted = Math.round(value).toString();
  }

  return `${formatted} ${unitLabel}`;
}
