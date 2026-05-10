import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { appendExperiment, hasRejectedExperiment, loadExperimentLedger, queryExperiments } from "../src/experimentLedger.js";
import { buildResearchCampaign, buildSymbolUniverse } from "../src/researchCampaigns.js";
import { buildStrategyApprovalKey, buildStrategyApprovalRecords, isApprovalGrantedFor } from "../src/strategyApproval.js";
import { discoverStrategies } from "../src/strategyRegistry.js";
import { computeApprovalFingerprint } from "../src/approvalFingerprint.js";
import { assertApprovalLiveSafety } from "../src/liveSafetyGate.js";

export const strategyPlatformTests = [
  {
    name: "strategy registry discovers migrated live and research strategies",
    async run(eq, truthy) {
      const registry = discoverStrategies();
      truthy("registry finds at least two strategies", registry.strategies.length >= 2);

      const live = registry.get("breakout_retest_v1");
      truthy("live breakout strategy exists", live);
      eq("live strategy lifecycle", live.lifecycleState, "live");
      eq("live strategy family", live.family, "breakout_retest");
      eq("live execution symbols stay V75/V50", live.executionEligibleSymbols.join(","), "VOLATILITY_75,VOLATILITY_50");
      truthy("live strategy has local rules file", live.rulesPath.endsWith("strategies/breakout_retest_v1/rules.json"));
      truthy("live strategy has local pine file", live.pinePath.endsWith("strategies/breakout_retest_v1/pine/breakout_retest_v1.pine"));
      truthy("live strategy approval remains gated", live.approvalStatus.includes("gate"));

      const research = registry.get("v75_ema_rsi_momentum_research_v1");
      truthy("research strategy exists", research);
      eq("research lifecycle", research.lifecycleState, "research");
      eq("research has no execution symbols", research.executionEligibleSymbols.length, 0);
      eq("research supports V75 study", research.supportedResearchSymbols.join(","), "VOLATILITY_75");
      eq("research approval status", research.approvalStatus, "not_approved");
    },
  },
  {
    name: "strategy scoped approval records are keyed per strategy and symbol",
    async run(eq, truthy) {
      const fingerprint = computeApprovalFingerprint({ includeGitCommit: false });
      const records = buildStrategyApprovalRecords({
        fingerprint: { ...fingerprint, symbols: ["VOLATILITY_75"] },
        approved: false,
        demoApproved: true,
        realApproved: false,
        files: ["R_75.csv"],
        validatedAt: "2026-05-10T00:00:00.000Z",
      });
      eq("one scoped approval for one symbol", records.length, 1);
      eq("scoped approval symbol", records[0].symbol, "VOLATILITY_75");
      eq("scoped approval demo flag", records[0].demoApproved, true);
      eq("scoped approval real flag", records[0].realApproved, false);
      eq("scoped approval key is deterministic", records[0].key, buildStrategyApprovalKey(records[0]));

      const approval = {
        demoApproved: true,
        realApproved: false,
        fingerprint,
        strategyApprovals: records,
      };
      truthy("V75 demo approval is granted", isApprovalGrantedFor({ approval, fingerprint, symbol: "VOLATILITY_75", accountMode: "demo" }).ok);
      eq("V50 demo approval is not inherited", isApprovalGrantedFor({ approval, fingerprint, symbol: "VOLATILITY_50", accountMode: "demo" }).ok, false);
      eq("V75 real approval is not granted by demo", isApprovalGrantedFor({ approval, fingerprint, symbol: "VOLATILITY_75", accountMode: "real" }).ok, false);
    },
  },
  {
    name: "runtime live safety blocks scoped approval symbol mismatch",
    async run(eq, truthy) {
      const fingerprint = computeApprovalFingerprint({ includeGitCommit: false });
      const scoped = buildStrategyApprovalRecords({
        fingerprint: { ...fingerprint, symbols: ["VOLATILITY_75"] },
        approved: false,
        demoApproved: true,
        realApproved: false,
        files: ["R_75.csv"],
        validatedAt: "2026-05-10T00:00:00.000Z",
      });
      let message = "";
      try {
        assertApprovalLiveSafety({
          dryRun: false,
          account: { loginid: "VR000", is_virtual: true },
          approval: { demoApproved: true, realApproved: false, fingerprint, strategyApprovals: scoped },
          currentFingerprint: fingerprint,
          symbol: "VOLATILITY_50",
        });
      } catch (err) {
        message = err.message;
      }
      truthy("scoped mismatch blocks execution", message.includes("VOLATILITY_50"));
    },
  },
  {
    name: "experiment ledger persists promoted and rejected experiments",
    async run(eq, truthy) {
      const dir = "state-test-experiment-ledger";
      const file = `${dir}/experiments.jsonl`;
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        appendExperiment({
          filePath: file,
          experiment: {
            strategyId: "breakout_retest_v1",
            strategyVersion: 1,
            symbol: "VOLATILITY_75",
            timeframe: "15",
            datasetSource: "fixture",
            parameters: { ema: 50 },
            trainMetrics: { trades: 60, profitFactor: 1.8 },
            testMetrics: { trades: 25, profitFactor: 1.4 },
            walkForwardMetrics: { degradationPct: 22 },
            promotionDecision: "rejected",
            rejectionReason: "walk-forward degradation too high",
            artifactPaths: ["state/research/reports/rejected.json"],
            operatorAgentSource: "codex-test",
            timestamp: "2026-05-10T00:00:00.000Z",
          },
        });
        appendExperiment({
          filePath: file,
          experiment: {
            strategyId: "breakout_retest_v1",
            strategyVersion: 1,
            symbol: "VOLATILITY_50",
            timeframe: "15",
            datasetSource: "fixture",
            parameters: { ema: 50 },
            trainMetrics: { trades: 70, profitFactor: 1.9 },
            testMetrics: { trades: 30, profitFactor: 1.7 },
            walkForwardMetrics: { degradationPct: 10 },
            promotionDecision: "promoted",
            artifactPaths: ["state/research/reports/promoted.json"],
            operatorAgentSource: "codex-test",
            timestamp: "2026-05-10T00:05:00.000Z",
          },
        });

        const records = loadExperimentLedger({ filePath: file });
        eq("two ledger records loaded", records.length, 2);
        eq("rejected ideas remain queryable", queryExperiments(records, { promotionDecision: "rejected" }).length, 1);
        truthy("rejection memory detects repeated dead idea", hasRejectedExperiment(records, {
          strategyId: "breakout_retest_v1",
          strategyVersion: 1,
          symbol: "VOLATILITY_75",
          timeframe: "15",
          parameters: { ema: 50 },
        }));
        truthy("ledger file is durable JSONL", readFileSync(file, "utf8").trim().split(/\r?\n/).length === 2);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: "research campaign builds broad synthetic universe and rejection-aware batch plan",
    async run(eq, truthy) {
      const universe = buildSymbolUniverse({
        families: ["crash", "boom", "jump", "step", "range_break", "basket", "bull_bear", "volatility"],
      });
      truthy("universe includes Crash", universe.symbols.some(item => item.symbol.startsWith("CRASH_")));
      truthy("universe includes Boom", universe.symbols.some(item => item.symbol.startsWith("BOOM_")));
      truthy("universe includes Jump", universe.symbols.some(item => item.symbol.startsWith("JUMP_")));
      truthy("universe includes Step", universe.symbols.some(item => item.symbol.startsWith("STEP_")));
      truthy("universe includes Range Break", universe.symbols.some(item => item.symbol.startsWith("RANGE_BREAK_")));
      truthy("universe includes baskets", universe.symbols.some(item => item.symbol.endsWith("_BASKET")));
      truthy("universe includes Bull/Bear", universe.symbols.some(item => item.symbol === "BULL_MARKET" || item.symbol === "BEAR_MARKET"));
      truthy("universe includes Volatility", universe.symbols.some(item => item.symbol === "VOLATILITY_75"));

      const ledgerRecords = [{
        strategyId: "v75_ema_rsi_momentum_research_v1",
        strategyVersion: 1,
        symbol: "CRASH_500",
        timeframe: "15",
        parameterHash: "8f14e45fceea167a5a36dedd4bea2543",
        parameters: { emaPeriod: 200 },
        promotionDecision: "rejected",
        rejectionReason: "insufficient out-of-sample profit factor",
      }];
      const campaign = buildResearchCampaign({
        id: "synthetic-scan",
        objective: "rank multi-symbol strategy ideas",
        strategyIds: ["v75_ema_rsi_momentum_research_v1"],
        symbols: ["CRASH_500", "JUMP_75"],
        timeframes: ["15"],
        parameters: { emaPeriod: 200 },
        ledgerRecords,
      });
      eq("campaign is research only", campaign.executionAllowed, false);
      truthy("campaign has walk-forward evidence phase", campaign.evidenceFlow.some(step => step.id === "walk_forward_validation"));
      truthy("campaign marks rejected repeat", campaign.batchPlan.some(item => item.symbol === "CRASH_500" && item.skip === true));
      truthy("campaign keeps non-rejected symbol runnable", campaign.batchPlan.some(item => item.symbol === "JUMP_75" && item.skip === false));
    },
  },
  {
    name: "research campaign symbol universe accepts live active_symbols outside fallback catalog",
    async run(eq, truthy) {
      const universe = buildSymbolUniverse({
        symbols: ["NEW_500"],
        activeSymbols: [{
          market: "synthetic_index",
          submarket: "random_index",
          symbol: "NEW500",
          display_name: "New 500 Index",
        }],
      });
      eq("live active_symbols source is used", universe.source, "deriv-active_symbols");
      eq("live-only symbol is selected", universe.symbols[0].symbol, "NEW_500");
      eq("live-only symbol stays research-only", universe.symbols[0].executionSupported, false);
    },
  },
];
