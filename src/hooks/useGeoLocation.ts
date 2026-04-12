import { useState, useEffect } from 'react';

interface GeoLocationData {
  country?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

export const useGeoLocation = () => {
  const [geoData, setGeoData] = useState<GeoLocationData>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchGeoData = async () => {
      try {
        // Try to get data from IP geolocation service
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
          const data = await response.json();
          setGeoData({
            country: data.country_name,
            city: data.city,
            state: data.region,
            latitude: data.latitude,
            longitude: data.longitude,
            timezone: data.timezone,
          });
        }
      } catch (error) {
        console.log('Could not fetch geo data:', error);
        // Fallback to browser geolocation if available
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setGeoData({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            },
            (error) => {
              console.log('Geolocation error:', error);
            }
          );
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchGeoData();
  }, []);

  return { geoData, isLoading };
};