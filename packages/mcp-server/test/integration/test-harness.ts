import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { resolve, dirname } from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * MCP Integration Test Harness
 * Spawns server process and communicates via JSON-RPC over stdio
 */
export class MCPTestHarness extends EventEmitter {
  private serverProcess: ChildProcess | null = null;
  private responseBuffer = "";
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  private readonly serverPath: string;
  private readonly defaultTimeout = 30000; // 30 seconds

  constructor(serverPath?: string) {
    super();
    this.serverPath = serverPath || resolve(__dirname, "../../dist/src/index.js");
  }

  /**
   * Start MCP server process
   */
  async start(env: Record<string, string> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Spawn server process with custom environment
        this.serverProcess = spawn("node", [this.serverPath], {
          env: {
            ...process.env,
            ...env,
          },
          stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
        });

        // Handle stdout data (JSON-RPC responses)
        this.serverProcess.stdout?.on("data", (data) => {
          this.handleServerOutput(data);
        });

        // Handle stderr (server logs)
        this.serverProcess.stderr?.on("data", (data) => {
          const message = data.toString();
          this.emit("log", message);
          
          // Check if server started successfully
          if (message.includes("Phase Mirror MCP Server running")) {
            resolve();
          }
        });

        // Handle process exit
        this.serverProcess.on("exit", (code, signal) => {
          this.emit("exit", { code, signal });
          this.cleanupPendingRequests(
            new Error(`Server process exited with code ${code}, signal ${signal}`)
          );
        });

        // Handle process errors
        this.serverProcess.on("error", (error) => {
          this.emit("error", error);
          reject(error);
        });

        // Timeout if server doesn't start
        setTimeout(() => {
          if (this.serverProcess && !this.serverProcess.killed) {
            resolve(); // Assume started if process is still running
          }
        }, 2000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop MCP server process
   */
  async stop(): Promise<void> {
    if (!this.serverProcess) {
      return;
    }

    return new Promise((resolve) => {
      if (!this.serverProcess) {
        resolve();
        return;
      }

      this.serverProcess.once("exit", () => {
        this.serverProcess = null;
        resolve();
      });

      // Try graceful shutdown first
      this.serverProcess.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          this.serverProcess.kill("SIGKILL");
        }
      }, 5000);
    });
  }

  /**
   * Send JSON-RPC request to server
   */
  async request(method: string, params: any, timeout?: number): Promise<any> {
    if (!this.serverProcess) {
      throw new Error("Server process not started");
    }

    const id = randomUUID();
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutMs = timeout || this.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutHandle);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        },
        timeout: timeoutHandle,
      });

      // Send request to server stdin
      const requestStr = JSON.stringify(request) + "\n";
      this.serverProcess!.stdin?.write(requestStr);
    });
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any> {
    return this.request("tools/list", {});
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: any, timeout?: number): Promise<any> {
    return this.request("tools/call", { name, arguments: args }, timeout);
  }

  /**
   * Initialize MCP protocol handshake
   */
  async initialize(): Promise<any> {
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: "mcp-test-harness",
        version: "0.1.0",
      },
    });
  }

  /**
   * Handle server output and parse JSON-RPC responses
   */
  private handleServerOutput(data: Buffer): void {
    this.responseBuffer += data.toString();

    // Try to parse complete JSON-RPC messages
    const lines = this.responseBuffer.split("\n");
    this.responseBuffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const response = JSON.parse(line);
        this.handleJsonRpcResponse(response);
      } catch (error) {
        this.emit("parseError", { line, error });
      }
    }
  }

  /**
   * Handle parsed JSON-RPC response
   */
  private handleJsonRpcResponse(response: any): void {
    // Handle responses with ID (replies to requests)
    if (response.id) {
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        
        if (response.error) {
          pending.reject(new Error(response.error.message || "Unknown error"));
        } else {
          pending.resolve(response.result);
        }
      }
    }

    // Handle notifications (no ID)
    if (!response.id) {
      this.emit("notification", response);
    }
  }

  /**
   * Clean up all pending requests on error
   */
  private cleanupPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }

  /**
   * Get server process ID
   */
  getPid(): number | undefined {
    return this.serverProcess?.pid;
  }
}

/**
 * Helper function to create and start a test harness
 */
export async function createTestHarness(
  env?: Record<string, string>,
  serverPath?: string
): Promise<MCPTestHarness> {
  const harness = new MCPTestHarness(serverPath);
  await harness.start(env);
  return harness;
}

/**
 * Helper function for integration tests with automatic cleanup
 */
export async function withTestHarness<T>(
  testFn: (harness: MCPTestHarness) => Promise<T>,
  env?: Record<string, string>,
  serverPath?: string
): Promise<T> {
  const harness = await createTestHarness(env, serverPath);
  try {
    return await testFn(harness);
  } finally {
    await harness.stop();
  }
}
