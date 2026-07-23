# Evidence and honesty contract

## Status meanings

| Status | Meaning |
|---|---|
| `YES — EXECUTED AND VERIFIED` | The requested operation ran and its required evidence was checked. |
| `NO — CAPABILITY UNAVAILABLE` | The verified MCP does not implement the requested capability. |
| `NOT VERIFIED — EVIDENCE INSUFFICIENT` | A claim may be plausible, but the required proof was not obtained. |
| `BLOCKED — DEPENDENCY FAILED` | A required repository, connector, process, CDP target, tool, or artifact failed. |

## Evidence levels

| Level | What it proves | What it does not prove |
|---|---|---|
| Discovery | A tool name/schema was listed. | The tool can execute successfully. |
| Invocation | The MCP returned a non-error result. | TradingView visibly changed when a change was requested. |
| State verification | Before/after state or artifact confirms the result. | Unrelated state remained unchanged unless checked. |
| Reversible verification | The change was confirmed and temporary state restored. | Permanent user-requested changes were correct without separate review. |

Never promote a lower evidence level into a higher one.

## Required proof by operation

- Chart read: symbol, timeframe, and structured result.
- Symbol/timeframe change: state before and state after.
- Drawing create: returned entity ID plus `draw_list` or screenshot.
- Drawing removal: returned removal result plus ID absent afterward.
- Screenshot: returned file path plus file existence and nonzero size.
- Indicator change: study list before and after.
- Pine edit: source acknowledgement, compile result, and error inspection.
- Strategy result: Strategy Tester metrics, invalid-data flag, and any approval blockers.
- Alert: identifier plus alert list state.
- Replay: replay status before and after.
- Recovery: failed check, exact repair action, and successful rerun of that check.

## Fail-closed rules

Stop mutation when:

- repository origin differs;
- combined tool count is not 114;
- CDP is unavailable;
- no local chart target exists;
- preflight screenshot cannot be verified;
- the requested tool returns an MCP error;
- before state cannot be captured for a reversible operation;
- cleanup of a temporary test fails.

## Forbidden rationalizations

| Excuse | Required response |
|---|---|
| “The tool exists, so it works.” | Discovery is not execution. Run it. |
| “The command returned no error.” | Verify the resulting state or artifact. |
| “The Claude repo is already configured.” | Wrong primary identity. Stop. |
| “The browser version is equivalent.” | Local TradingView Desktop is required. |
| “I can clear everything and rebuild it.” | Preserve user state; mutate the exact object only. |
| “Full access means live trading.” | Inspect the implemented MCP contract; do not infer authority. |
| “The stream failed, so start over.” | Resume from the last recorded evidence. |

## Completion template

```text
YES — EXECUTED AND VERIFIED
Action: <requested action>
Tool: <exact MCP tool>
Before: <relevant state>
Result: <faithful result summary>
After: <verified resulting state>
Evidence: <entity ID, metrics, or artifact path>
Cleanup: <restoration result or not applicable>
Limitations: <discovery-only or untested boundaries>
```

A failed request uses the same fields but begins with `NO`, `NOT VERIFIED`, or `BLOCKED` and names the exact failure.
