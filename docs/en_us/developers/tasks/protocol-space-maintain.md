# Developer Guide - Protocol Space Operator Development Changes

This document records the operator development feature, implementation responsibilities, validation results, and outstanding work on `feat/protocol-space-operator-growth-mode` for code review and maintenance.  
Updated on November 8, 2026.

## Feature Scope

Protocol Space gains an "Operator development" mode: selecting operators calculates their total development material requirements and uses those quantities as inventory targets, reusing the existing inventory recognition, farming, and reward collection flow. This branch includes development data, calculation nodes, and selection cases for 34 operators.

## Changes

| File or directory | Change |
| --- | --- |
| `tools/pipeline-generate/ProtocolSpace/operator-growth-data.mjs` | Generate development material details from zmdmap data and add missing operators incrementally |
| `assets/data/ProtocolSpace/operatorgrowth_detail_data.json` | Store level, breakthrough, skill, and talent material data |
| `tools/pipeline-generate/ProtocolSpace/operator-growth-nodes.mjs` | Incrementally add operator nodes, selection cases, execution references, and summary entries |
| `assets/resource/pipeline/ProtocolSpace/OperatorGrowth.json` | Connect individual calculations, aggregation, inventory target overrides, and the inventory flow |
| `assets/tasks/ProtocolSpace.json` | Add the development mode, operator selection cases, and inventory expression overrides |
| `agent/go-service/protocolspace/` | Implement and register three Custom Actions for calculation, aggregation, and inventory target overrides; display the material summary |
| `agent/go-service/register.go` | Connect `protocolspace.Register()` |
| `tools/schema/custom.action.schema.json` | Synchronize Custom Action registration names and parameter constraints |
| `assets/locales/interface/` | Add mode and option labels in five languages and reuse existing operator and material names |
| `package.json`, `.github/workflows/sync-zmdmap.yml` | Add `generate:ProtocolSpace` and integrate it into the data synchronization workflow |

## Implementation

### Data Generation

`operator-growth-data.mjs` reads `tools/zmdmap/data/operator_growth.json` and `collect_points.json`, excluding collectible materials and 存续的痕迹. Level, breakthrough, and skill costs accumulate backward from the final stage so runtime calculations can directly read the remaining materials for a given progress index; talent costs are currently stored as a total. Level experience uses `COMBAT_RECORD_EXP` and `COGNITIVE_CARRIER_EXP` separately.

The generator preserves existing operator data and only generates details for missing operators; shared `level_up` data is still updated from the source. The node generator only inserts missing entries, preserving existing parameters, comments, and order. New execution references are inserted before the summary node.

```bash
pnpm generate:ProtocolSpace
```

This command fetches source data, generates development details, and fills in nodes and selection cases in sequence. Source changes do not automatically overwrite existing operator development details; those updates require separate review and handling.

### Runtime Flow and Responsibilities

1. "Operator development" redirects `ProtocolSpaceScheduleEnabled.next` to `ProtocolSpaceGrowthMain`, and selected cases enable their operator nodes.
2. The Pipeline invokes enabled operator nodes through `JumpBack`; each node uses `max_hit: 1` to calculate once per run.
3. `ProtocolSpaceCalculateOperatorMaterialsAction` reads material details using the node parameters and writes the result to that node's `attach`.
4. `ProtocolSpaceSumOperatorMaterialsAction` aggregates enabled nodes into `ProtocolSpaceGrowthSummary.attach`. Old material keys are zeroed during writes so dictionary merging does not retain previous quantities.
5. `ProtocolSpaceOverrideOperatorSupplyPlanAction` substitutes the totals into inventory scheduling and reward completion expressions, after which the Pipeline enters `SupplyPlanMain`.

The Pipeline controls the flow; Go handles material calculation, aggregation, and data conversion. Inventory scanning, stage switching, and reward collection reuse existing flows. This branch adds no game screen recognition nodes.

### Material Summary

`reportOperatorMaterials` sorts by material ID and displays plain text through `maafocus.Print` after aggregation. The first line reads "The following materials are required for operator development:" in the selected language, with each material name and quantity on a separate line below. The title is available in all five languages. Experience materials use `option.SupplyPlanLimits.inputs.*.label`; other materials use `iconRecognition.name.*`. Experience quantities represent experience points rather than item counts.

The message shows total development requirements before subtracting inventory; the subsequent inventory flow evaluates shortages. The current message also includes materials with a quantity of zero.

## Completed Validation

The following code-level checks were completed during branch development; they do not establish successful in-game execution:

- Data, nodes, selection cases, and names in five languages match for all 34 operators.
- Material mappings and all 32 inventory expression replacement targets are complete.
- Committed development details match fresh calculations from source data.
- Repeated node generation performs no writes; incremental insertion preserves existing parameters, comments, and order.
- JS syntax, formatting of relevant files, and diff checks passed.
- `go test ./protocolspace` passed; the package currently has no unit tests, so this result only confirms successful package compilation.
- `uv run build-and-install` completed Go Agent compilation and installation.

`pnpm check` / `pnpm test` were not run locally; full resource checks are left to CI. UI messages, inventory scanning, farming transitions, and reward collection still require in-game validation.

## Current Limitations and Review Items

- The task UI only supports selecting operators and does not expose current development progress. Generated nodes default level, breakthrough, skill, and talent parameters to `1`, so calculations use initial progress.
- Breakthrough parameters only support `1–7`, and the talent parameter is fixed at `1`. These entries still contain material costs; there is no zero-requirement state for completed breakthroughs or talents.

Under the repository's [AI programming standards](../coding-standards.md#ai-programming-standards), developers need to understand and review this implementation and its limitations before deciding on further commits or merging.
