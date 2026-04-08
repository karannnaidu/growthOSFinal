// ---------------------------------------------------------------------------
// Agent Spawner — Task 3.3
//
// Provides spawnSubAgent() and spawnParallelAgents() for executing sequences
// or parallel groups of agent skills. Used by Mia and scheduled triggers.
//
// Server-side only.
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { runSkill } from '@/lib/skills-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTask {
  agentId: string;
  skillIds: string[];
  goal: string;
  context?: Record<string, any>;
}

export interface AgentRunResult {
  agentId: string;
  results: Array<{ skillId: string; status: string; output: any }>;
  summary: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  color: string;
  avatar: string;
  skills: string[];
  triggers?: string[];
  schedule: string | null;
  is_manager: boolean;
  can_spawn: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// Agents.json cache
// ---------------------------------------------------------------------------

let agentsCache: AgentConfig[] | null = null;
const AGENTS_JSON_PATH = path.join(process.cwd(), 'skills', 'agents.json');

/**
 * Load and cache the agents.json config.
 */
function loadAgentsJson(): AgentConfig[] {
  if (agentsCache) return agentsCache;

  try {
    const raw = fs.readFileSync(AGENTS_JSON_PATH, 'utf-8');
    agentsCache = JSON.parse(raw) as AgentConfig[];
    return agentsCache;
  } catch (err) {
    console.warn('[AgentSpawner] Could not load agents.json:', err);
    return [];
  }
}

/**
 * Load a single agent's config by id.
 * Returns null if not found.
 */
export function loadAgentConfig(agentId: string): AgentConfig | null {
  const agents = loadAgentsJson();
  return agents.find((a) => a.id === agentId) ?? null;
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(
  agentId: string,
  goal: string,
  results: Array<{ skillId: string; status: string; output: any }>,
): string {
  const completed = results.filter((r) => r.status === 'completed');
  const failed = results.filter((r) => r.status === 'failed');

  const lines: string[] = [
    `Agent ${agentId} ran ${results.length} skill(s) for goal: "${goal}".`,
    `  Completed: ${completed.map((r) => r.skillId).join(', ') || 'none'}`,
  ];

  if (failed.length > 0) {
    lines.push(`  Failed: ${failed.map((r) => r.skillId).join(', ')}`);
  }

  // Append key output snippets (first completed skill only, truncated)
  const firstCompleted = completed[0];
  if (firstCompleted) {
    const snippet = JSON.stringify(firstCompleted.output).slice(0, 200);
    lines.push(`  First output snippet: ${snippet}${snippet.length >= 200 ? '...' : ''}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// spawnSubAgent
// ---------------------------------------------------------------------------

/**
 * Run a sequence of skills for a single agent.
 * Each skill receives the previous skill's output as `additionalContext`.
 * Individual skill runs are logged in the skill_runs table by runSkill().
 */
export async function spawnSubAgent(
  brandId: string,
  task: AgentTask,
  triggeredBy: 'mia' | 'schedule',
): Promise<AgentRunResult> {
  const results: Array<{ skillId: string; status: string; output: any }> = [];

  // Carry-forward context — starts from the task's initial context
  let currentContext: Record<string, any> = task.context ?? {};

  for (const skillId of task.skillIds) {
    try {
      const result = await runSkill({
        brandId,
        skillId,
        triggeredBy,
        additionalContext: {
          ...currentContext,
          agentGoal: task.goal,
          agentId: task.agentId,
        },
      });

      results.push({
        skillId,
        status: result.status,
        output: result.output,
      });

      // Pass this skill's output as context into the next skill
      if (result.status === 'completed') {
        currentContext = {
          ...currentContext,
          [`${skillId}_output`]: result.output,
        };
      }
    } catch (err) {
      console.warn(`[AgentSpawner] spawnSubAgent: skill "${skillId}" threw an error:`, err);
      results.push({
        skillId,
        status: 'failed',
        output: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return {
    agentId: task.agentId,
    results,
    summary: buildSummary(task.agentId, task.goal, results),
  };
}

// ---------------------------------------------------------------------------
// spawnParallelAgents
// ---------------------------------------------------------------------------

/**
 * Run multiple agents concurrently.
 * Each agent's skills run sequentially within itself; agents run in parallel.
 *
 * Example use: Scout detects issues → Max + Aria + Echo each fix their part.
 */
export async function spawnParallelAgents(
  brandId: string,
  tasks: AgentTask[],
  triggeredBy: 'mia' | 'schedule',
): Promise<AgentRunResult[]> {
  const settled = await Promise.allSettled(
    tasks.map((task) => spawnSubAgent(brandId, task, triggeredBy)),
  );

  return settled.map((result, i) => {
    const task = tasks[i]!;
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Rejected — surface a failed result so callers can still inspect
    console.warn(
      `[AgentSpawner] spawnParallelAgents: agent "${task.agentId}" threw:`,
      result.reason,
    );
    return {
      agentId: task.agentId,
      results: task.skillIds.map((skillId) => ({
        skillId,
        status: 'failed',
        output: { error: String(result.reason) },
      })),
      summary: `Agent ${task.agentId} failed entirely: ${String(result.reason)}`,
    };
  });
}
