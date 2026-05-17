import { readFileSync } from "fs";
import path from "path";
import {
  DERIV_EA_READONLY_TOOL_NAMES,
  loadDerivEaReadonlyContract,
  validateDerivEaReadonlyContract,
} from "../src/derivEaReadonlyContract.js";

const CONTRACT_PATH = path.resolve("docs/codex/agent-control/contracts/deriv-ea-readonly-report-contract.json");

export const derivEaReadonlyContractTests = [
  {
    name: "contract exposes only expected read-only report tools",
    async run(eq, truthy) {
      const contract = loadDerivEaReadonlyContract(CONTRACT_PATH);
      const result = validateDerivEaReadonlyContract(contract);
      const names = contract.tools.map(tool => tool.name);

      eq("contract validates", result.ok, true);
      eq("expected tool count", names.length, DERIV_EA_READONLY_TOOL_NAMES.length);
      for (const name of DERIV_EA_READONLY_TOOL_NAMES) {
        truthy(`${name} is listed`, names.includes(name));
      }
      eq("no validation blockers", result.blockers.length, 0);
    },
  },
  {
    name: "forbidden verbs fail contract validation",
    async run(eq, truthy) {
      const contract = loadDerivEaReadonlyContract(CONTRACT_PATH);
      const bad = {
        ...contract,
        tools: [
          ...contract.tools,
          {
            name: "deriv_ea.trade",
            mode: "write",
            description: "bad capability",
            reads: [],
          },
        ],
      };

      const result = validateDerivEaReadonlyContract(bad);

      eq("bad contract fails", result.ok, false);
      truthy("forbidden verb blocker is reported", result.blockers.some(blocker => blocker.code === "forbidden_tool_name"));
    },
  },
  {
    name: "contract file contains no executable capability text",
    async run(eq) {
      const text = readFileSync(CONTRACT_PATH, "utf8").toLowerCase();
      const forbidden = [
        " run terminal",
        " run tester",
        " write db",
        " place order",
        " start service",
      ];

      for (const token of forbidden) {
        eq(`${token.trim()} absent`, text.includes(token), false);
      }
    },
  },
];
