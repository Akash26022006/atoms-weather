
/* ======================================
   ATMOS WEATHER DASHBOARD
   Open-Meteo API — no API key required
====================================== */

const $ = (id) => document.getElementById(id);

const API = "https://api.open-meteo.com/v1/forecast";
const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

let currentPlace = null;
let weatherData = null;
let weatherMap = null;
let weatherMarker = null;
let weatherCircle = null;
let selectedDayIndex = 0;
let mapInitialized = false;

/* ======================================
   WEATHER CODE HELPERS
====================================== */

function condition(code) {
  if (code === 0) return ["Clear sky", "☀️"];
  if (code === 1) return ["Mainly clear", "🌤️"];
  if (code === 2) return ["Partly cloudy", "⛅"];
  if (code === 3) return ["Overcast", "☁️"];
  if ([45, 48].includes(code)) return ["Foggy", "🌫️"];
  if ([51, 53, 55].includes(code)) return ["Drizzle", "🌦️"];
  if ([56, 57].includes(code)) return ["Freezing drizzle", "🌧️"];
  if ([61, 63, 65].includes(code)) return ["Rain", "🌧️"];
  if ([66, 67].includes(code)) return ["Freezing rain", "🌧️"];
  if ([71, 73, 75, 77].includes(code)) return ["Snowfall", "❄️"];
  if ([80, 81, 82].includes(code)) return ["Rain showers", "🌦️"];
  if ([85, 86].includes(code)) return ["Snow showers", "🌨️"];
  if ([95, 96, 99].includes(code)) return ["Thunderstorm", "⛈️"];

  return ["Unknown conditions", "🌡️"];
}

function formatDay(dateString, options = { weekday: "short" }) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(
    "en-IN",
    options
  );
}

function formatTime(dateTime) {
  if (!dateTime) return "--:--";

  const time = dateTime.split("T")[1];

  if (!time) return "--:--";

  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function compassDirection(degrees) {
  if (degrees == null || Number.isNaN(Number(degrees))) return "--";

  const directions = [
    "N", "NE", "E", "SE", "S", "SW", "W", "NW"
  ];

  return directions[Math.round(Number(degrees) / 45) % 8];
}

function setStatus(message = "", isError = false) {
  const element = $("statusMessage");

  element.textContent = message;
  element.classList.toggle("error", isError);
}

/* ======================================
   CITY SEARCH
====================================== */

async function findCity(city) {
  const url = new URL(GEOCODING);

  url.search = new URLSearchParams({
    name: city,
    count: "1",
    language: "en",
    format: "json"
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Unable to search for this city.");
  }

  const result = await response.json();

  if (!result.results || result.results.length === 0) {
    throw new Error("City not found. Please check the spelling.");
  }

  const place = result.results[0];

  return {
    name: place.name,
    country: place.country || "",
    admin1: place.admin1 || "",
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone || "auto"
  };
}

/* ======================================
   FETCH FORECAST
====================================== */

async function getWeather(latitude, longitude, timezone = "auto") {
  const url = new URL(API);

  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone,
    forecast_days: "7",

    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "weather_code",
      "pressure_msl",
      "wind_speed_10m",
      "wind_direction_10m"
    ].join(","),

    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation_probability",
      "weather_code",
      "wind_speed_10m",
      "visibility"
    ].join(","),

    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "sunrise",
      "sunset",
      "uv_index_max",
      "precipitation_probability_max"
    ].join(",")
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Weather service is unavailable. Try again.");
  }

  return response.json();
}

/* ======================================
   MAIN LOAD FUNCTION
====================================== */

async function loadWeather(city) {
  setStatus("Finding weather data...");

  try {
    const place = await findCity(city);

    setStatus(`Loading forecast for ${place.name}...`);

    const data = await getWeather(
      place.latitude,
      place.longitude,
      place.timezone
    );

    currentPlace = place;
    weatherData = data;
    selectedDayIndex = 0;

    renderCurrentWeather();
    renderMetrics();
    renderHourlyForecast();
    renderWeeklyForecast();
    renderDaySelector();
    renderSunTimes();
    initializeMap();
    renderMapWeather();

    $("mapDateLabel").textContent = formatDay(
      data.daily.time[0],
      { weekday: "long", day: "numeric", month: "short" }
    );

    setStatus(
      `Updated forecast for ${place.name}, ${place.country}.`
    );

    setTimeout(() => {
      if (weatherMap) weatherMap.invalidateSize();
    }, 150);

  } catch (error) {
    console.error(error);
    setStatus(
      error.message || "Unable to load weather. Please try again.",
      true
    );
  }
}

/* ======================================
   CURRENT WEATHER HERO
====================================== */

function renderCurrentWeather() {
  const current = weatherData.current;
  const daily = weatherData.daily;

  const [description, emoji] = condition(current.weather_code);

  $("currentCity").textContent =
    `${currentPlace.name}, ${currentPlace.country}`;

  $("currentDate").textContent =
    new Intl.DateTimeFormat("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: currentPlace.timezone
    }).format(new Date());

  $("currentTemp").innerHTML =
    `${Math.round(current.temperature_2m)}<span>°</span>`;

  $("currentDescription").textContent = description;
  $("currentIcon").textContent = emoji;

  $("feelsLike").textContent =
    `${Math.round(current.apparent_temperature)}°C`;

  $("todayHigh").textContent =
    `${Math.round(daily.temperature_2m_max[0])}°`;

  $("todayLow").textContent =
    `${Math.round(daily.temperature_2m_min[0])}°`;

  $("uvIndex").textContent =
    daily.uv_index_max[0] ?? "--";

  const isDay = current.is_day === 1;

  $("visualCaption").textContent = isDay
    ? "Make the most of your day."
    : "Your night, at a glance.";

  $("sunsetCaption").textContent =
    `Sunset at ${formatTime(daily.sunset[0])}`;
}

/* ======================================
   WEATHER METRICS
====================================== */

function renderMetrics() {
  const current = weatherData.current;

  $("humidity").innerHTML =
    `${Math.round(current.relative_humidity_2m)}<small>%</small>`;

  $("humidityMeter").style.width =
    `${current.relative_humidity_2m}%`;

  $("windSpeed").innerHTML =
    `${Math.round(current.wind_speed_10m)}<small> km/h</small>`;

  $("windDirection").textContent =
    `Direction ${compassDirection(current.wind_direction_10m)} · ${Math.round(current.wind_direction_10m)}°`;

  $("pressure").innerHTML =
    `${Math.round(current.pressure_msl)}<small> hPa</small>`;

  const currentTime = current.time;
  const hourIndex = weatherData.hourly.time.indexOf(currentTime);

  const visibility = hourIndex >= 0
    ? weatherData.hourly.visibility[hourIndex]
    : null;

  $("visibility").innerHTML =
    visibility == null
      ? `--<small> km</small>`
      : `${(visibility / 1000).toFixed(1)}<small> km</small>`;
}

/* ======================================
   HOURLY FORECAST
====================================== */

function renderHourlyForecast() {
  const hourly = weatherData.hourly;
  const currentTime = weatherData.current.time;

  let startIndex = hourly.time.findIndex(
    (time) => time >= currentTime
  );

  if (startIndex < 0) startIndex = 0;

  const endIndex = Math.min(
    startIndex + 24,
    hourly.time.length
  );

  $("hourlyDate").textContent =
    `${formatDay(weatherData.daily.time[0], {
      weekday: "long",
      day: "numeric",
      month: "short"
    })} · Next 24 hours`;

  let html = "";

  for (let i = startIndex; i < endIndex; i++) {
    const [description, emoji] = condition(hourly.weather_code[i]);

    const hourLabel = i === startIndex
      ? "Now"
      : formatTime(hourly.time[i]);

    const temperature = Math.round(hourly.temperature_2m[i]);
    const rain = hourly.precipitation_probability[i];

    html += `
      <article class="hourly-item" title="${description}">
        <span class="hourly-time">${hourLabel}</span>
        <span class="hourly-icon">${emoji}</span>
        <strong class="hourly-temp">${temperature}°</strong>
        <span class="hourly-rain">💧 ${rain ?? 0}%</span>
      </article>
    `;
  }

  $("hourlyForecast").innerHTML = html;
}

/* ======================================
   WEEKLY FORECAST
====================================== */

function renderWeeklyForecast() {
  const daily = weatherData.daily;

  const allTemps = [
    ...daily.temperature_2m_min,
    ...daily.temperature_2m_max
  ];

  const minTemp = Math.min(...allTemps);
  const maxTemp = Math.max(...allTemps);
  const span = Math.max(maxTemp - minTemp, 1);

  $("weeklyForecast").innerHTML = daily.time.map((date, index) => {
    const [description, emoji] = condition(daily.weather_code[index]);

    const low = Math.round(daily.temperature_2m_min[index]);
    const high = Math.round(daily.temperature_2m_max[index]);
    const rain = daily.precipitation_probability_max[index] ?? 0;

    const left = ((low - minTemp) / span) * 100;
    const width = Math.max(((high - low) / span) * 100, 5);

    const dayName = index === 0
      ? "Today"
      : formatDay(date, { weekday: "short" });

    return `
      <button
        class="weekly-row ${index === selectedDayIndex ? "selected" : ""}"
        data-week-index="${index}"
        aria-pressed="${index === selectedDayIndex}"
        title="${description}. Click to explore this day."
      >
        <span class="weekly-day">${dayName}</span>
        <span class="weekly-icon">${emoji}</span>
        <span class="weekly-description">${description}</span>

        <span class="weekly-range">
          <span>${low}°</span>
          <span class="weekly-bar">
            <span style="margin-left:${left}%;width:${width}%"></span>
          </span>
          <span>${high}°</span>
        </span>

        <span class="weekly-rain">💧 ${rain}%</span>
      </button>
    `;
  }).join("");
}

/* ======================================
   DAY SELECTOR
====================================== */

function renderDaySelector() {
  const daily = weatherData.daily;

  $("daySelector").innerHTML = daily.time.map((date, index) => {
    const [, emoji] = condition(daily.weather_code[index]);

    const dayName = index === 0
      ? "Today"
      : formatDay(date, { weekday: "short" });

    return `
      <button
        class="day-option ${index === selectedDayIndex ? "selected" : ""}"
        data-day-index="${index}"
        aria-pressed="${index === selectedDayIndex}"
      >
        <span>${dayName}</span>
        <strong>${emoji}</strong>
        <small>
          ${Math.round(daily.temperature_2m_max[index])}° /
          ${Math.round(daily.temperature_2m_min[index])}°
        </small>
      </button>
    `;
  }).join("");
}

function selectDay(index) {
  if (!weatherData || index < 0 || index >= weatherData.daily.time.length) {
    return;
  }

  selectedDayIndex = index;

  renderWeeklyForecast();
  renderDaySelector();
  renderMapWeather();

  $("mapDateLabel").textContent = formatDay(
    weatherData.daily.time[index],
    { weekday: "long", day: "numeric", month: "short" }
  );
}

/* ======================================
   SUNRISE & SUNSET
====================================== */

function renderSunTimes() {
  const daily = weatherData.daily;

  $("sunrise").textContent = formatTime(daily.sunrise[0]);
  $("sunset").textContent = formatTime(daily.sunset[0]);
}

/* ======================================
   INTERACTIVE MAP
====================================== */

function initializeMap() {
  if (!window.L) {
    setStatus(
      "Weather loaded, but the map library did not load. Check your internet connection.",
      true
    );
    return;
  }

  const lat = currentPlace.latitude;
  const lon = currentPlace.longitude;

  if (!mapInitialized) {
    weatherMap = L.map("weatherMap", {
      zoomControl: true
    }).setView([lat, lon], 8);

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    ).addTo(weatherMap);

    weatherMarker = L.marker([lat, lon]).addTo(weatherMap);

    weatherCircle = L.circle([lat, lon], {
      radius: 18000,
      color: "#48bfa0",
      weight: 1.5,
      fillColor: "#48bfa0",
      fillOpacity: 0.16
    }).addTo(weatherMap);

    mapInitialized = true;
  } else {
    weatherMap.setView([lat, lon], 8);
    weatherMarker.setLatLng([lat, lon]);
    weatherCircle.setLatLng([lat, lon]);
  }

  weatherMarker.bindPopup(
    `<strong>${currentPlace.name}</strong><br>Selected forecast location`
  );
}

function renderMapWeather() {
  if (!weatherData || !currentPlace) return;

  const date = weatherData.daily.time[selectedDayIndex];
  const hour = Number($("timeSlider").value);
  const timeString = `${date}T${String(hour).padStart(2, "0")}:00`;

  const index = weatherData.hourly.time.indexOf(timeString);

  $("selectedTime").textContent =
    `${String(hour).padStart(2, "0")}:00`;

  if (index < 0) {
    $("mapWeatherDescription").textContent =
      "Forecast unavailable for this time";
    return;
  }

  const hourly = weatherData.hourly;
  const [description, emoji] = condition(hourly.weather_code[index]);
  const layer = $("mapLayer").value;

  let value;
  let unit;

  if (layer === "rain") {
    value = hourly.precipitation_probability[index];
    unit = "%";
  } else if (layer === "wind") {
    value = hourly.wind_speed_10m[index];
    unit = " km/h";
  } else {
    value = hourly.temperature_2m[index];
    unit = "°C";
  }

  const displayValue = value == null
    ? "--"
    : `${Math.round(value)}${unit}`;

  $("mapWeatherIcon").textContent = emoji;
  $("mapWeatherTemp").textContent = displayValue;

  $("mapWeatherDescription").textContent =
    layer === "rain"
      ? `Rain probability · ${description}`
      : layer === "wind"
        ? `Wind speed · ${description}`
        : description;

  if (!weatherMap || !weatherMarker || !weatherCircle) return;

  const lat = currentPlace.latitude;
  const lon = currentPlace.longitude;

  weatherMarker.setLatLng([lat, lon]);
  weatherCircle.setLatLng([lat, lon]);

  weatherMarker.setIcon(
    L.divIcon({
      className: "",
      html: `<div class="weather-marker">${emoji} ${displayValue}</div>`,
      iconSize: [100, 42],
      iconAnchor: [50, 21]
    })
  );

  weatherMarker.bindPopup(`
    <strong>${currentPlace.name}</strong><br>
    ${date} · ${String(hour).padStart(2, "0")}:00<br>
    ${description}<br>
    ${layer === "rain" ? "Rain probability" : layer === "wind" ? "Wind speed" : "Temperature"}: ${displayValue}
  `);

  // Visual indicator only; not a real weather radar layer.
  const radius = layer === "rain"
    ? Math.max(5000, (value ?? 0) * 300)
    : layer === "wind"
      ? Math.max(5000, (value ?? 0) * 1000)
      : Math.max(5000, (value ?? 20) * 700);

  const circleColor = layer === "rain"
    ? "#61a8ff"
    : layer === "wind"
      ? "#b8a5ff"
      : "#48bfa0";

  weatherCircle.setStyle({
    color: circleColor,
    fillColor: circleColor,
    fillOpacity: 0.16
  });

  weatherCircle.setRadius(radius);
}

/* ======================================
   SEARCH FORM
====================================== */

$("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const city = $("cityInput").value.trim();

  if (!city) {
    setStatus("Please enter a city name.", true);
    return;
  }

  await loadWeather(city);
});

/* ======================================
   SELECT DAY FROM EITHER LIST
====================================== */

$("weeklyForecast").addEventListener("click", (event) => {
  const button = event.target.closest("[data-week-index]");
  if (!button) return;

  selectDay(Number(button.dataset.weekIndex));

  $("mapSection").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

$("daySelector").addEventListener("click", (event) => {
  const button = event.target.closest("[data-day-index]");
  if (!button) return;

  selectDay(Number(button.dataset.dayIndex));
});

/* ======================================
   TIME & WEATHER LAYER CONTROLS
====================================== */

$("timeSlider").addEventListener("input", renderMapWeather);
$("mapLayer").addEventListener("change", renderMapWeather);

/* ======================================
   CURRENT LOCATION
====================================== */

$("locationButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported by this browser.", true);
    return;
  }

  setStatus("Finding your current location...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        const reverseUrl = new URL(
          "https://geocoding-api.open-meteo.com/v1/reverse"
        );

        reverseUrl.search = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          language: "en",
          format: "json"
        });

        const response = await fetch(reverseUrl);

        if (!response.ok) {
          throw new Error("Could not identify your location.");
        }

        const result = await response.json();
        const place = result.results?.[0];

        if (place) {
          $("cityInput").value = place.name;
          await loadWeather(place.name);
        } else {
          // If reverse geocoding doesn't return a city, use coordinates.
          const data = await getWeather(latitude, longitude);

          currentPlace = {
            name: "Your location",
            country: "",
            latitude,
            longitude,
            timezone: data.timezone || "auto"
          };

          weatherData = data;
          selectedDayIndex = 0;

          renderCurrentWeather();
          renderMetrics();
          renderHourlyForecast();
          renderWeeklyForecast();
          renderDaySelector();
          renderSunTimes();
          initializeMap();
          renderMapWeather();

          setStatus("Weather loaded for your current location.");
        }
      } catch (error) {
        console.error(error);
        setStatus(
          error.message || "Unable to load your location's weather.",
          true
        );
      }
    },
    (error) => {
      const message = error.code === 1
        ? "Location permission denied. Allow location access in your browser."
        : error.code === 2
          ? "Your location could not be determined."
          : "Location request timed out. Try again.";

      setStatus(message, true);
    },
    {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 300000
    }
  );
});

/* ======================================
   DARK / LIGHT THEME
====================================== */

$("themeToggle").addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light-theme");

  $("themeIcon").textContent = isLight ? "☀" : "☾";
  $("themeText").textContent = isLight
    ? "Dark appearance"
    : "Light appearance";
});

/* ======================================
   INITIAL LOAD
====================================== */

document.addEventListener("DOMContentLoaded", () => {
  loadWeather("Chennai");
});
