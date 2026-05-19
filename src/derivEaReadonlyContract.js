import { readFileSync } from "fs";

export const DERIV_EA_READONLY_TOOL_NAMES = Object.freeze([
  "deriv_ea.list_reports",
  "deriv_ea.read_repo_capabilities",
  "deriv_ea.read_demo_status",
  "deriv_ea.read_shadow_status",
  "deriv_ea.read_symbol_policy",
  "deriv_ea.read_replay_metrics",
  "deriv_ea.read_safety_blockers",
  "deriv_ea.propose_task_queue",
  "deriv_ea.propose_pr_plan",
]);

export const DERIV_EA_FORBIDDEN_REPORT_TOOL_TERMS = Object.freeze([
  "trade",
  "order",
  "deploy",
  "start",
  "run terminal",
  "run tester",
  "write db",
  "retrain",
  "export",
  "credential",
]);

const REPORT_ROOT = "out/reports/";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushBlocker(blockers, code, detail) {
  blockers.push({ code, detail });
}

function containsForbiddenTerm(value) {
  const text = String(value ?? "").toLowerCase();
  return DERIV_EA_FORBIDDEN_REPORT_TOOL_TERMS.find(term => text.includes(term));
}

export function loadDerivEaReadonlyContract(contractPath) {
  return JSON.parse(readFileSync(contractPath, "utf8").replace(/^\uFEFF/, ""));
}

export function validateDerivEaReadonlyContract(contract) {
  const blockers = [];
  const tools = asArray(contract?.tools);
  const names = tools.map(tool => tool?.name).filter(Boolean);
  const expected = new Set(DERIV_EA_READONLY_TOOL_NAMES);
  const actual = new Set(names);

  for (const name of DERIV_EA_READONLY_TOOL_NAMES) {
    if (!actual.has(name)) {
      pushBlocker(blockers, "missing_tool", name);
    }
  }

  for (const name of names) {
    if (!expected.has(name)) {
      pushBlocker(blockers, "unexpected_tool", name);
    }
  }

  if (names.length !== actual.size) {
    pushBlocker(blockers, "duplicate_tool_name", "tool names must be unique");
  }

  for (const tool of tools) {
    const name = tool?.name ?? "";
    const forbiddenNameTerm = containsForbiddenTerm(name);
    if (forbiddenNameTerm) {
      pushBlocker(blockers, "forbidden_tool_name", `${name} contains ${forbiddenNameTerm}`);
    }

    const forbiddenDescriptionTerm = containsForbiddenTerm(tool?.description);
    if (forbiddenDescriptionTerm) {
      pushBlocker(blockers, "forbidden_tool_description", `${name} contains ${forbiddenDescriptionTerm}`);
    }

    if (tool?.mode !== "read_only") {
      pushBlocker(blockers, "non_read_only_mode", name || "(unnamed tool)");
    }

    if (tool?.side_effects !== false) {
      pushBlocker(blockers, "side_effects_not_false", name || "(unnamed tool)");
    }

    if (tool?.executes === true) {
      pushBlocker(blockers, "executes_true", name || "(unnamed tool)");
    }

    if (asArray(tool?.writes).length !== 0) {
      pushBlocker(blockers, "write_path_declared", name || "(unnamed tool)");
    }

    const reads = asArray(tool?.reads);
    if (reads.length === 0) {
      pushBlocker(blockers, "missing_report_read_path", name || "(unnamed tool)");
    }

    for (const readPath of reads) {
      const normalized = String(readPath ?? "").replaceAll("\\", "/");
      if (!normalized.startsWith(REPORT_ROOT)) {
        pushBlocker(blockers, "non_report_read_path", `${name}: ${readPath}`);
      }
    }

    if (name.startsWith("deriv_ea.propose_")) {
      if (tool?.proposal_only !== true) {
        pushBlocker(blockers, "proposal_tool_missing_proposal_only", name);
      }
      if (tool?.executes !== false) {
        pushBlocker(blockers, "proposal_tool_must_not_execute", name);
      }
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
  };
}
