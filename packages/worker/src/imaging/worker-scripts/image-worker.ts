/**
 * Image Processing Worker Script
 * Performs image scaling and processing tasks within a web worker
 */
import {
  ImageTaskType,
  ImageProcessingOptions,
  ImageTaskRequest,
  ImageTaskResponse,
  ImageFormat,
  ProcessingResult,
} from "../types.js";

// Disable debug logging for production environment
const DEBUG = false;

// Helper function for logging
function log(...args: any[]) {
  if (DEBUG) {
    console.log("[ImageWorker]", ...args);
  }
}

// Helper function for sending messages to main thread
function sendMessage(data: any) {
  if (!data.type) {
    console.warn("Message missing required type field:", data);
  }
  self.postMessage(data);
}

// Send worker initialization message
sendMessage({ type: "workerReady", timestamp: Date.now() });

/**
 * Calculate target dimensions for scaling
 * Considers aspect ratio maintenance option when determining dimensions
 *
 * @param originalWidth - Original image width in pixels
 * @param originalHeight - Original image height in pixels
 * @param options - Processing options containing requested dimensions
 * @returns Object with calculated width and height
 */
function calculateTargetSize(
  originalWidth: number,
  originalHeight: number,
  options: ImageProcessingOptions
): { width: number; height: number } {
  let targetWidth = options.width || originalWidth;
  let targetHeight = options.height || originalHeight;

  if (options.maintainAspectRatio !== false) {
    const aspectRatio = originalWidth / originalHeight;
    if (options.width && !options.height) {
      targetHeight = Math.round(options.width / aspectRatio);
    } else if (!options.width && options.height) {
      targetWidth = Math.round(options.height * aspectRatio);
    }
  }

  return {
    width: Math.max(1, Math.round(targetWidth)),
    height: Math.max(1, Math.round(targetHeight)),
  };
}

/**
 * Reports progress to the main thread
 *
 * @param progress - Progress value between 0 and 1
 * @param taskId - Unique task identifier
 */
function reportProgress(progress: number, taskId: string) {
  sendTaskProgress(taskId, progress);
}

/**
 * Main image processing function
 * Loads image data, processes according to options, and returns result
 *
 * @param task - Task request containing image data and processing options
 * @returns Promise resolving to task response with result or error
 */
async function processImageTask(
  task: ImageTaskRequest
): Promise<ImageTaskResponse> {
  const startTime = Date.now();

  try {
    // Load image from URL
    const response = await fetch(task.imageData);
    const imageFormat = response.headers.get("content-type") || "image/jpeg";
    const sourceBlob = await response.blob();
    const image = await createImageBitmap(sourceBlob);

    // Calculate dimensions
    const { width: targetWidth, height: targetHeight } = calculateTargetSize(
      image.width,
      image.height,
      task.options
    );

    // Report progress - Image loading complete
    reportProgress(0.3, task.taskId);

    // Create offscreen canvas
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");

    // Draw image on canvas
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    // Report progress - Image drawing complete
    reportProgress(0.6, task.taskId);

    // Get blob from OffscreenCanvas
    const resultBlob = await canvas.convertToBlob({
      type: task.options.format || "image/jpeg",
      quality: task.options.quality || 0.8,
    });

    // Create data URL from blob
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(resultBlob);
    });

    // Report progress - Processing complete
    reportProgress(1.0, task.taskId);

    // Create result object conforming to ProcessingResult type
    const result: ProcessingResult = {
      data: dataUrl,
      width: targetWidth,
      height: targetHeight,
      format: (task.options.format as ImageFormat) || ImageFormat.JPEG,
      originalWidth: image.width,
      originalHeight: image.height,
      processingTime: Date.now() - startTime,
    };

    // Return completed task response
    return {
      type: "taskCompleted",
      taskId: task.taskId,
      result,
    };
  } catch (error) {
    console.error("Image processing failed:", error);
    return {
      type: "taskFailed",
      taskId: task.taskId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Set up message listener for worker
self.addEventListener("message", async (event) => {
  const message = event.data;

  try {
    // Handle task start message
    if (message && message.type === "startTask") {
      const taskId = message.taskId;
      const taskData = message.data as ImageTaskRequest;

      log("Task received:", taskId, taskData.type);

      // Process task and send response
      const response = await processImageTask(taskData);

      log("Task response sent:", response.type);
      self.postMessage(response);
    } else if (message && message.type === "ping") {
      // Handle ping message for worker activity check
      self.postMessage({
        type: "pong",
        data: {
          timestamp: Date.now(),
        },
      });
    }
  } catch (error) {
    console.error("Worker global error:", error);
    if (message && message.taskId) {
      self.postMessage({
        type: "taskFailed",
        taskId: message.taskId,
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
});

/**
 * Sends task completion message to main thread
 *
 * @param taskId - Unique task identifier
 * @param result - Task processing result
 */
function sendTaskComplete(taskId: string, result: any) {
  sendMessage({
    type: "taskCompleted",
    taskId,
    result,
    timestamp: Date.now(),
  });
}

/**
 * Sends task failure message to main thread
 *
 * @param taskId - Unique task identifier
 * @param error - Error object or message
 */
function sendTaskFailed(taskId: string, error: any) {
  sendMessage({
    type: "taskFailed",
    taskId,
    error: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  });
}

/**
 * Sends task progress message to main thread
 *
 * @param taskId - Unique task identifier
 * @param progress - Progress value between 0 and 1
 */
function sendTaskProgress(taskId: string, progress: number) {
  sendMessage({
    type: "taskProgress",
    taskId,
    progress,
    timestamp: Date.now(),
  });
}

/**
 * Sends cache hit notification to main thread
 *
 * @param imageId - Image identifier that was found in cache
 */
function sendCacheHit(imageId: string) {
  sendMessage({
    type: "cacheHit",
    imageId,
    timestamp: Date.now(),
  });
}

/**
 * Sends cache miss notification to main thread
 *
 * @param imageId - Image identifier that was not found in cache
 */
function sendCacheMiss(imageId: string) {
  sendMessage({
    type: "cacheMiss",
    imageId,
    timestamp: Date.now(),
  });
}
