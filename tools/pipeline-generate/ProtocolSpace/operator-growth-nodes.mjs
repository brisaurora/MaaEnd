import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {applyEdits, modify} from "jsonc-parser";
import {format, resolveConfig} from "prettier";

import {parseJsonc, readJsonc} from "../jsonc.mjs";
import {dataDir, repoRoot} from "../utils/paths.mjs";

const locales = [
    "zh_cn",
    "zh_tw",
    "en_us",
    "ja_jp",
    "ko_kr",
];
const documents = [];

function openDocument(relativePath) {
    const path = resolve(repoRoot, relativePath);
    const original = readFileSync(path, "utf8");
    const document = {path, original, text: original, value: parseJsonc(original, path)};
    documents.push(document);
    return document;
}

function insert(document, path, value) {
    document.text = applyEdits(
        document.text,
        modify(document.text, path, value, {
            isArrayInsertion: true,
            formattingOptions: {insertSpaces: true, tabSize: 4},
        }),
    );
    document.value = parseJsonc(document.text, document.path);
}

async function saveDocuments() {
    const changes = [];
    for (const document of documents) {
        if (document.text === document.original) continue;
        const text = await format(document.text, {...(await resolveConfig(document.path)), filepath: document.path});
        changes.push({path: document.path, text});
    }
    // 所有文件格式化成功后再写回，避免格式化失败时只更新部分配置。
    for (const {path, text} of changes) writeFileSync(path, text, "utf8");
}

async function generateOperatorGrowthNodes() {
    // 以已生成的培养明细决定支持的干员，上游数据仅用于查找名称。
    const growth = readJsonc(resolve(repoRoot, "assets/data/ProtocolSpace/operatorgrowth_detail_data.json"));
    const source = readJsonc(resolve(dataDir, "operator_growth.json"));
    // 名称数据只读，无需加入待写回的文档列表。
    const messages = Object.fromEntries(
        locales.map((locale) => [
            locale,
            readJsonc(resolve(repoRoot, `assets/locales/interface/${locale}.json`)),
        ]),
    );

    const pipeline = openDocument("assets/resource/pipeline/ProtocolSpace/OperatorGrowth.json");
    const task = openDocument("assets/tasks/ProtocolSpace.json");
    const nodes = [];
    let added = 0;

    for (const id of Object.keys(growth.operators).sort()) {
        const englishName = source.operators[id]?.names?.en_us;
        const labels = Object.keys(messages.en_us).filter(
            (key) => key.startsWith("operator.") && messages.en_us[key] === englishName,
        );
        if (labels.length !== 1 || Object.values(messages).some((locale) => !locale[labels[0]])) {
            throw new Error(`[ProtocolSpace] ${id} 缺少唯一的干员名称或五语言文案`);
        }
        const label = labels[0];
        const nodeName = `ProtocolSpaceGrowth${label.slice("operator.".length)}`;
        if (nodes.includes(nodeName)) throw new Error(`[ProtocolSpace] 干员节点重名: ${nodeName}`);
        nodes.push(nodeName);

        // 增加新干员材料计算节点
        if (!pipeline.value[nodeName]) {
            insert(pipeline, [nodeName], {
                enabled: false,
                max_hit: 1,
                pre_delay: 0,
                action: {
                    type: "Custom",
                    param: {
                        custom_action: "ProtocolSpaceCalculateOperatorMaterialsAction",
                        custom_action_param: {
                            __ProtocolSpaceGrowthOperator: id,
                            __ProtocolSpaceGrowthOperatorLevel: 1,
                            __ProtocolSpaceGrowthBreaknode: 1,
                            __ProtocolSpaceGrowthNormalAttackLevel: 1,
                            __ProtocolSpaceGrowthNormalSkillLevel: 1,
                            __ProtocolSpaceGrowthComboSkillLevel: 1,
                            __ProtocolSpaceGrowthUltimateSkillLevel: 1,
                            __ProtocolSpaceGrowthTalentLevel: 1,
                        },
                    },
                },
                post_delay: 0,
                rate_limit: 0,
            });
            added++;
        }
        const reference = `[JumpBack]${nodeName}`;
        const next = pipeline.value.ProtocolSpaceGrowthMain.next;
        //主流程增加新干员
        if (!next.includes(reference)) {
            insert(
                pipeline,
                [
                    "ProtocolSpaceGrowthMain",
                    "next",
                    next.indexOf("ProtocolSpaceGrowthSummary"),
                ],
                reference,
            );
        }
        //汇总节点增加新干员
        if (!pipeline.value.ProtocolSpaceGrowthSummary.action.param.custom_action_param.nodes.includes(nodeName)) {
            insert(
                pipeline,
                [
                    "ProtocolSpaceGrowthSummary",
                    "action",
                    "param",
                    "custom_action_param",
                    "nodes",
                    -1,
                ],
                nodeName,
            );
        }
        //task配置增加新干员
        if (!task.value.option.ProtocolSpaceGrowthOperators.cases.some((entry) => entry.name === id)) {
            insert(
                task,
                [
                    "option",
                    "ProtocolSpaceGrowthOperators",
                    "cases",
                    -1,
                ],
                {
                    name: id,
                    label: `$${label}`,
                    pipeline_override: {[nodeName]: {enabled: true}},
                },
            );
        }
    }

    await saveDocuments();
    console.log(`[ProtocolSpace] 新增 ${added} 个干员节点，共 ${nodes.length} 名干员，已同步选择项与汇总列表`);
}

await generateOperatorGrowthNodes();
