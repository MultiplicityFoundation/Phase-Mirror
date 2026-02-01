/**
 * Analysis module - Reusable orchestration layer for Phase Mirror
 * 
 * This module provides a reusable orchestrator that can be used by
 * CLI, MCP server, GitHub Actions, and other integrations.
 */

export {
  AnalysisOrchestrator,
  createOrchestrator,
  type AnalysisOrchestratorConfig,
  type AnalysisInput,
  type AnalysisOutput,
  type FileArtifact,
  type RepositoryContext,
} from './orchestrator.js';
