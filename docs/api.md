# HyperViz API Documentation

## Table of Contents

- [@hyperviz/worker](#hypervizworker)
  - [WorkerPool](#workerpool)
  - [WorkerAdapter](#workeradapter)
  - [EventStream](#eventstream)
  - [StreamManager](#streammanager)
  - [Utility Functions](#utility-functions)
- [@hyperviz/weather](#hypervizweather)
  - [Weather Layers](#weather-layers)
  - [Processors](#processors)
  - [Utilities](#utilities)
  - [Services](#services)

---

## @hyperviz/worker

### WorkerPool

The main class for managing web worker pools and processing tasks.

#### Constructor

```typescript
constructor(config: Partial<WorkerPoolConfig> = {})
```

**Parameters**:

- `config`: Worker pool configuration
  - `minWorkers`: Minimum number of workers (default: 1)
  - `maxWorkers`: Maximum number of workers (default: 4)
  - `idleTimeout`: Worker idle timeout (ms, default: 30000)
  - `workerUrl`: Worker URL (web environment)
  - `workerFile`: Worker file path (Node.js environment)
  - `workerOptions`: Worker options
  - `taskTimeout`: Task timeout (ms, default: 60000)
  - `taskPollingInterval`: Task polling interval (ms, default: 100)
  - `statsUpdateInterval`: Statistics update interval (ms, default: 5000)
  - `enableLogging`: Enable logging (default: true)

#### Key Methods

```typescript
async submitTask<T, R>(data: T, options?: Partial<TaskOptions<T, R>>): Promise<R>
```

Submit a task and return the result.

**Parameters**:

- `data`: Data to process
- `options`: Task options
  - `id`: Task ID
  - `priority`: Task priority
  - `timeout`: Task timeout
  - `workerType`: Worker type
  - `maxRetries`: Maximum retry count
  - `onProgress`: Progress callback

```typescript
async cancelTask(taskId: string): Promise<boolean>
```

Cancel a task.

```typescript
async getTaskStatus(taskId: string): Promise<TaskStatus | undefined>
```

Return task status.

```typescript
getStats(): WorkerPoolStats
```

Return worker pool statistics.

```typescript
createEventStream<T = any>(options: StreamOptions = {}): EventStream<T>
```

Create an event stream.

```typescript
async shutdown(force: boolean = false): Promise<void>
```

Shut down the worker pool.

### WorkerAdapter

Class responsible for communicating with web workers.

#### Constructor

```typescript
constructor(options: WorkerOptions = {})
```

**Parameters**:

- `options`: Worker options
  - `url`: Worker URL (web environment)
  - `file`: Worker file path (Node.js environment)
  - `type`: Worker type
  - `options`: Additional options

#### Key Methods

```typescript
async postMessage(message: any, transfer?: Transferable[]): Promise<void>
```

Send a message to the worker.

```typescript
addEventListener(event: string, callback: Function): void
```

Add an event listener.

```typescript
removeEventListener(event: string, callback: Function): void
```

Remove an event listener.

```typescript
terminate(): void
```

Terminate the worker.

### EventStream

Class for managing event streams.

```typescript
subscribe(callback: (data: T) => void): () => void
```

Subscribe to the event stream.

```typescript
close(): void
```

Close the event stream.

### StreamManager

Class for managing streams.

### Utility Functions

```typescript
generateId(): string
```

Generate a unique ID.

```typescript
delay(ms: number): Promise<void>
```

Delay for a specified time.

```typescript
deepCopy<T>(obj: T): T
```

Return a deep copy of an object.

```typescript
now(): number
```

Return the current timestamp.

```typescript
errorToString(error: any): string
```

Convert an error to a string.

---

## @hyperviz/weather

### Weather Layers

#### BaseWeatherLayer

Base class for all weather layers.

```typescript
abstract class BaseWeatherLayer<T extends WeatherLayerOptions = WeatherLayerOptions>
```

**Key Methods**:

- `abstract getType(): WeatherLayerType`
- `abstract createLayer(): BaseLayer`
- `addToMap(map: Map): BaseLayer`
- `removeFromMap(): void`
- `setWeatherData(data: WeatherData[]): void`
- `setVisible(visible: boolean): void`
- `startAnimation(): void`
- `stopAnimation(): void`
- `dispose(): void`

#### Implemented Layers

- `WindLayer`: Visualizes wind flow.
- `TemperatureLayer`: Visualizes temperature distribution.
- `PrecipitationLayer`: Visualizes precipitation.
- `CloudLayer`: Visualizes cloud distribution.
- `SolarLayer`: Visualizes solar radiation.

### Processors

#### BaseProcessor

Base class for all processors.

```typescript
abstract class BaseProcessor
```

**Key Methods**:

- `abstract getType(): ProcessorType`
- `abstract process(data: any): Promise<any>`
- `abstract render(canvas: OffscreenCanvas, data: WeatherDataBase[], options: any): Promise<any>`
- `async handleMessage(data: any): Promise<any>`

#### Implemented Processors

- `WindProcessor`: Wind data processing and visualization
- `TemperatureProcessor`: Temperature data processing and visualization
- `PrecipitationProcessor`: Precipitation data processing and visualization
- `CloudProcessor`: Cloud data processing and visualization
- `SolarProcessor`: Solar radiation data processing and visualization

### Utilities

#### worker-registry.ts

Initializes and manages the worker system.

```typescript
function initializeWorkerSystem(
  options: WeatherWorkerOptions = {}
): Promise<WorkerPool>;
```

Initialize the worker system.

```typescript
function submitTask(processor: ProcessorType, data: any): Promise<any>;
```

Submit a task to a worker.

```typescript
function cleanupWorkerSystem(): Promise<void>;
```

Clean up the worker system.

### Services

#### WeatherService

Service for fetching and managing weather data.

```typescript
class WeatherService
```

**Key Methods**:

- `async fetchData(): Promise<WeatherData[]>`
- `setUpdateInterval(interval: number): void`
- `generateMockData(count: number = 100): WeatherData[]`
- `dispose(): void`

---

## Usage Examples

### @hyperviz/worker Usage Example

```typescript
import { WorkerPool } from "@hyperviz/worker";

// Create a worker pool
const pool = new WorkerPool({
  minWorkers: 2,
  maxWorkers: 4,
});

// Submit a task
const result = await pool.submitTask({
  type: "calculation",
  data: [1, 2, 3, 4, 5],
});

// Shut down the worker pool
await pool.shutdown();
```

### @hyperviz/weather Usage Example

```typescript
import { WindLayer } from "@hyperviz/weather";
import { Map } from "ol";

// Create a map object
const map = new Map({
  target: "map",
  // Other settings...
});

// Create a wind layer
const windLayer = new WindLayer({
  particleDensity: 0.8,
  fadeOpacity: 0.92,
  colorScale: ["rgba(0, 191, 255, 0.8)"],
});

// Add the layer to the map
windLayer.addToMap(map);

// Set weather data
windLayer.setWeatherData(weatherData);

// Start animation
windLayer.startAnimation();
```
