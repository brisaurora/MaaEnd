# 开发手册 - 协议空间干员培养改动说明

本文记录 `feat/protocol-space-operator-growth-mode` 分支的干员培养功能、实现分工、验证结果与待完成项，供代码审查和后续维护使用。  
该文档更新于 2026 年 11 月 8 日。

## 功能范围

协议空间新增“干员培养”模式：选择干员后计算培养材料总量，将结果作为目标库存，复用现有库存识别、刷取和领奖流程。本分支补齐了 34 名干员的培养数据、计算节点与选择项。

## 修改内容

| 文件或目录 | 改动 |
| --- | --- |
| `tools/pipeline-generate/ProtocolSpace/operator-growth-data.mjs` | 从 zmdmap 数据生成培养材料明细，增量补齐缺失干员 |
| `assets/data/ProtocolSpace/operatorgrowth_detail_data.json` | 保存等级、突破、技能及天赋材料数据 |
| `tools/pipeline-generate/ProtocolSpace/operator-growth-nodes.mjs` | 增量补齐干员节点、选择项、执行引用与汇总列表 |
| `assets/resource/pipeline/ProtocolSpace/OperatorGrowth.json` | 串联单干员计算、多干员汇总、库存目标覆写及库存流程 |
| `assets/tasks/ProtocolSpace.json` | 新增培养模式、干员选择项及库存表达式覆盖配置 |
| `agent/go-service/protocolspace/` | 实现并注册材料计算、汇总和库存目标覆写三个 Custom Action，输出材料汇总提示 |
| `agent/go-service/register.go` | 接入 `protocolspace.Register()` |
| `tools/schema/custom.action.schema.json` | 同步 Custom Action 注册名和参数约束 |
| `assets/locales/interface/` | 添加五语言模式与选项名称，复用已有干员及材料名称 |
| `package.json`、`.github/workflows/sync-zmdmap.yml` | 增加 `generate:ProtocolSpace` 命令并接入数据同步工作流 |

## 实现逻辑

### 数据生成

`operator-growth-data.mjs` 读取 `tools/zmdmap/data/operator_growth.json` 和 `collect_points.json`，排除采集材料及存续的痕迹。等级、突破和技能消耗从末级向前累计，运行时可直接读取对应进度的剩余材料；天赋材料目前按总量保存。等级经验分别使用 `COMBAT_RECORD_EXP` 和 `COGNITIVE_CARRIER_EXP` 表示。

生成器保留已有干员数据，只为缺失干员生成明细；公共 `level_up` 数据仍会根据源数据更新。节点生成器只插入缺失项，保留已有参数、注释和排列顺序，新增执行引用插入到汇总节点之前。

```bash
pnpm generate:ProtocolSpace
```

该命令依次获取源数据、生成培养明细、补齐节点与选项。源数据变化不会自动覆盖已有干员的培养明细，更新这些数据需要单独审查处理。

### 运行流程与职责

1. “干员培养”模式将 `ProtocolSpaceScheduleEnabled.next` 指向 `ProtocolSpaceGrowthMain`，勾选项启用对应干员节点。
2. Pipeline 通过 `JumpBack` 逐个调用启用的干员节点；每个节点以 `max_hit: 1` 保证本轮只计算一次。
3. `ProtocolSpaceCalculateOperatorMaterialsAction` 按节点参数读取材料明细，并将结果写入该节点的 `attach`。
4. `ProtocolSpaceSumOperatorMaterialsAction` 汇总启用节点的材料，写入 `ProtocolSpaceGrowthSummary.attach`。写回时清零旧材料键，避免字典合并保留上次数量。
5. `ProtocolSpaceOverrideOperatorSupplyPlanAction` 将汇总数量替换进库存调度与领奖达标表达式，然后由 Pipeline 进入 `SupplyPlanMain`。

流程控制留在 Pipeline，Go 负责材料计算、汇总和数据转换。库存扫描、关卡切换及领奖沿用现有流程，本分支未新增游戏界面识别节点。

### 材料提示

`reportOperatorMaterials` 按材料 ID 排序，通过 `maafocus.Print` 在汇总完成后输出纯文本。首行为支持五语言的“培养材料需求如下：”，后续逐行显示材料名称和数量。经验类材料使用 `option.SupplyPlanLimits.inputs.*.label`，其他材料使用 `iconRecognition.name.*`；经验类数量是经验值，不是道具个数。

提示显示培养材料总需求，尚未扣除已有库存；库存缺口交给后续库存流程判断。当前提示也会包含数量为零的材料。

## 已完成的验证

以下是本分支开发期间已完成的代码层验证，不代表实机验证通过：

- 34 名干员的数据、节点、选择项与五语言名称对应完整。
- 材料映射和 32 个库存表达式替换目标无遗漏。
- 已提交的培养明细与从源数据重新计算的结果一致。
- 节点生成器重复运行无写入；增量插入保留已有参数、注释和顺序。
- JS 语法检查、相关文件格式检查及 diff 检查通过。
- `go test ./protocolspace` 通过；该包目前没有单元测试，此结果仅确认包编译通过。
- `uv run build-and-install` 已完成 Go Agent 构建与安装。

未在本地运行 `pnpm check` / `pnpm test`，全量资源检查交由 CI。界面提示、库存扫描、刷取切换及领奖流程仍需实机验证。

## 当前限制与审查事项

- 任务界面仅支持勾选干员，尚未提供当前培养进度输入。生成节点的等级、突破、技能和天赋参数默认均为 `1`，实际按初始进度计算。
- 突破参数仅支持 `1～7`，天赋参数固定为 `1`，对应数据仍有材料消耗，尚未提供“已全部完成”的零需求状态。

按仓库的 [AI 编程规范](../coding-standards.md#ai-编程规范)，上述实现逻辑和限制需要由开发者理解并 review，再决定后续提交或合并。
