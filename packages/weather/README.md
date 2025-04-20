# Hyperviz Weather

A high-performance, worker-based rendering module for weather visualization using OffscreenCanvas.

## Key Features

- High-performance rendering using worker threads
- Reduced main thread load through OffscreenCanvas
- Layers for integration with OpenLayers maps
- Data caching using IndexedDB
- Built-in weather data services

## Supported Weather Layer Types

- Wind
- Precipitation
- Temperature
- Solar Radiation
- Cloud Coverage

## Installation

```bash
npm install @hyperviz/weather
```

or

```bash
yarn add @hyperviz/weather
```

## Usage

### Basic Setup

```typescript
import { WindLayer, initializeWorkerSystem } from "@hyperviz/weather";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";

// Initialize worker system
initializeWorkerSystem({
  poolSize: 2, // Number of workers (default: available CPU cores)
});

// Create OpenLayers map
const map = new Map({
  target: "map",
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
  ],
  view: new View({
    center: [14135027.5, 4511307.6], // Seoul
    zoom: 7,
  }),
});

// Create wind layer
const windLayer = new WindLayer({
  maxSpeed: 15,
  particleDensity: 1.0,
  fadeOpacity: 0.95,
  colorScale: ["rgba(0, 191, 255, 0.8)"],
  lineWidth: 1.5,
});

// Add layer to map
windLayer.addToMap(map);
```

### Setting Weather Data

```typescript
import { WeatherService } from "@hyperviz/weather";

// Create weather service
const weatherService = new WeatherService({
  apiKey: "your-api-key", // Optional
  updateInterval: 300, // Update every 5 minutes (seconds)
});

// Map boundary coordinates
const bounds: [[number, number], [number, number]] = [
  [124.0, 33.0], // Southwest
  [132.0, 39.0], // Northeast
];

// Fetch weather data
weatherService.fetchWeatherData(bounds).then((weatherData) => {
  // Set weather data to layer
  windLayer.setWeatherData(weatherData);
});

// Start automatic updates
weatherService.startAutoUpdate(bounds, (weatherData) => {
  windLayer.setWeatherData(weatherData);
});
```

### Using Mock Data for Development

```typescript
import { generateMockWeatherData } from "@hyperviz/weather";

// Generate mock weather data
const mockData = generateMockWeatherData({
  bounds: [
    [124.0, 33.0],
    [132.0, 39.0],
  ],
  resolution: 0.5, // Grid resolution in degrees
  type: "wind", // or 'precipitation', 'temperature', 'cloud', 'solar'
});

// Set mock data to layer
windLayer.setWeatherData(mockData);
```

### Animation Control

```typescript
// Start animation
windLayer.startAnimation();

// Pause animation
windLayer.stopAnimation();

// Change animation speed
windLayer.setOptions({ animationSpeed: 0.5 }); // 0.5x speed
```

### Resource Cleanup

```typescript
// Clean up when done
windLayer.dispose();
weatherService.stopAutoUpdate();
cleanupWorkerSystem();
```

## Offline Support

Weather data is stored using IndexedDB, allowing use of the last cached data in offline environments.

## Dependencies

- OpenLayers (ol)
- @hyperviz/worker

## Browser Support

- Chrome 69+
- Firefox 79+
- Safari 16.4+
- Edge 79+

Works in all modern browsers that support the OffscreenCanvas API.

## Examples

See the `examples/` directory for working examples, or check our [examples documentation](https://github.com/heartyoh/hyperviz/blob/main/docs/examples.md) for detailed explanations:

- Basic weather maps
- Weather data integration
- Advanced visualization options
- Layer customization

## Documentation

For comprehensive API documentation, see the [API reference](https://github.com/heartyoh/hyperviz/blob/main/docs/api.md).

## License

MIT
