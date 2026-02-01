#!/usr/bin/env node
/**
 * Debug script to test individual tool calls and see responses
 */

import { MCPTestHarness } from "./test-harness.js";

async function debugTool(toolName: string, args: any): Promise<void> {
  const harness = new MCPTestHarness();
  
  try {
    console.log(`\n=== Starting server ===`);
    await harness.start({ LOG_LEVEL: "error" });
    
    console.log(`\n=== Initializing protocol ===`);
    await harness.initialize();
    
    console.log(`\n=== Calling tool: ${toolName} ===`);
    console.log("Arguments:", JSON.stringify(args, null, 2));
    
    const result = await harness.callTool(toolName, args, 30000);
    
    console.log(`\n=== Response ===`);
    console.log(JSON.stringify(result, null, 2));
    
    if (result.content && result.content[0] && result.content[0].text) {
      console.log(`\n=== Parsed content ===`);
      const parsed = JSON.parse(result.content[0].text);
      console.log(JSON.stringify(parsed, null, 2));
    }
  } catch (error: any) {
    console.error(`\n=== Error ===`);
    console.error(error.message);
    console.error(error.stack);
  } finally {
    console.log(`\n=== Stopping server ===`);
    await harness.stop();
  }
}

// Test all three tools with empty args
const tools = [
  { name: "analyze_dissonance", args: {} },
  { name: "validate_l0_invariants", args: {} },
  { name: "check_consent_requirements", args: {} },
];

for (const tool of tools) {
  await debugTool(tool.name, tool.args);
}

process.exit(0);
