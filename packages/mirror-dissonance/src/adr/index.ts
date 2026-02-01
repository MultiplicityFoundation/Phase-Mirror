/**
 * ADR (Architecture Decision Record) module
 * 
 * This module provides functionality for parsing, matching, and validating
 * code against Architecture Decision Records.
 */

export * from "./types.js";
export * from "./parser.js";
export * from "./matcher.js";
export * from "./validator.js";

// Re-export convenience functions
export { createADRParser } from "./parser.js";
export { createADRMatcher } from "./matcher.js";
export { createADRValidator } from "./validator.js";
