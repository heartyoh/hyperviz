# @hyperviz/worker

A library for efficient web worker management and parallel processing.

## Key Features

- Worker pool and task queue management
- Event stream support
- Image processing and caching
- OffscreenCanvas support
- Advanced WebGL rendering

## WebGL Rendering Capabilities

The latest version provides enhanced WebGL rendering capabilities:

### Shader Management System

- Automated shader program compilation and linking
- Simplified uniform and attribute management
- WebGL 2.0 shader support
- GLSL error detection and reporting

### VAO and Geometry System

- Vertex Array Object (VAO) support
- Efficient buffer management
- Automatic VAO extension application in WebGL 1.0
- Support for complex geometry data structures

### Texture Management

- Texture loading and caching
- Support for various formats (RGBA, RGB, Luminance, etc.)
- Automatic mipmap generation
- Texture atlas support for efficient rendering

### Instance Rendering

- Efficient rendering of large quantities of objects
- WebGL 2.0 instancing support
- Automatic extension application in WebGL 1.0
- Dynamic instance data updates

## Performance Optimization

- Automatic worker thread balancing
- Transferable objects usage for zero-copy transfers
- Task prioritization system
- Memory management utilities

## Usage Examples

### Basic Worker Pool

```typescript
import { WorkerPool } from "@hyperviz/worker";

// Create a worker pool
const pool = new WorkerPool({
  minWorkers: 2,
  maxWorkers: 4,
  workerFile: "worker.js",
});

// Submit a task
const result = await pool.submitTask({
  type: "calculation",
  data: [1, 2, 3, 4, 5],
});

console.log("Result:", result);

// Clean up when done
await pool.shutdown();
```

### OffscreenCanvas Rendering

```typescript
import { OffscreenCanvasManager } from "@hyperviz/worker";

const canvas = document.getElementById("canvas");
const manager = new OffscreenCanvasManager({
  canvas,
  contextType: "webgl2",
  autoResize: true,
});

// Handle ready event
manager.on("ready", () => {
  // Send WebGL rendering commands
  manager.sendCommand({
    type: "render",
    params: {
      // Rendering parameters
    },
  });
});

// Handle resize events
window.addEventListener("resize", () => {
  manager.resize();
});
```

## Installation

```bash
npm install @hyperviz/worker
```

or

```bash
yarn add @hyperviz/worker
```

## Browser Compatibility

- Chrome 69+
- Firefox 79+
- Safari 16.4+
- Edge 79+

Works in all modern browsers that support Web Workers and OffscreenCanvas.

## Documentation

For detailed API documentation, see the [documentation](https://github.com/hyperviz/worker/docs) or the `docs/` directory.

## Examples

Check the `examples/` directory for working demos:

- Worker pool management
- Image processing with workers
- WebGL rendering with OffscreenCanvas
- Real-time data processing

## License

MIT
