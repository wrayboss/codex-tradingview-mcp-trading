# Presentation Workbook Generator

The workbook for this presentation is generated from CSV input instead of being kept as a static binary artifact.
The tracked source CSV is a presentation input copy of `trades.legacy-20260429-065448.csv`, renamed so it is not treated as a local runtime artifact.

Run:

```powershell
npm run presentation:workbook -- --check
```

Default input:

```text
outputs/3289-trades-presentation/trades.presentation-source-20260429-065448.csv
```

Default output:

```text
outputs/3289-trades-presentation/trades.presentation-20260429-065448.xlsx
```
