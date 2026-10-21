import Image from "next/image";
import { createHash } from "node:crypto";
import { CopyButton } from "@/components/copy-button";
import type { DimensionMethod, StudyDimensions } from "@/lib/study-dimensions";
import { serverTr } from "@/lib/i18n-server";
import valueTranslations from "@/content/study-dimension-values-zh.json";
import promptTranslations from "@/content/study-prompts-zh.json";
import promptHashes from "@/content/study-prompts-en-hashes.json";

const methodLabels: Record<DimensionMethod, string> = { measured: "Measured", ocr: "Read from frames", vision: "Vision model", judged: "Judged", metadata: "Metadata" };
const groupLabelsZh: Record<string, string> = {
  time: "時間與節奏", colour: "色彩與明暗", composition: "構圖與版面", typography: "字體排版",
  content: "內容元素", sound: "聲音", meaning: "意涵與語氣", context: "背景資訊", use: "用途與限制",
};
const dimensionLabelsZh: Record<string, string> = {
  duration: "長度與影格率", cutRate: "剪接頻率", holdLength: "畫面停留時間", pacingArc: "節奏變化", repetition: "重複出現", loop: "循環設計",
  transitions: "轉場", motionInFrame: "畫面內的動作", palette: "色彩配置", saturation: "飽和度", brightnessArc: "明暗變化", contrast: "對比",
  texture: "紋理與質感", format: "版型", markPlacement: "標誌位置與大小", negativeSpace: "留白與網格", framing: "取景",
  typeFamilies: "字體種類", typeSetting: "文字層級與編排", onScreenText: "畫面文字", motif: "標誌或圖案", contexts: "模擬呈現場景",
  photography: "攝影", subjects: "每個畫面的主體", audio: "音樂與聲音", speech: "語音", genre: "類型與目的",
  communication: "結構傳達的訊息", voice: "品牌語氣", references: "參考與趨勢", source: "作者與日期", tag: "收藏標籤",
  caption: "貼文說明", engagement: "收藏時的互動數據", relevance: "與業務的關聯", limits: "證據與限制",
};

// The replicable analysis of one studied post: every dimension with how it is known.
export async function StudyDimensionsSection({ record }: { record: StudyDimensions }) {
  const tr = await serverTr();
  const translatedValue = (value: string) => tr(value, (valueTranslations as Record<string, string>)[value] ?? value);
  const studyKey = `${record.author}/${record.asset}`;
  const promptHash = createHash("sha256").update(record.prompt).digest("hex");
  const translatedPrompt = (promptHashes as Record<string, string>)[studyKey] === promptHash
    ? (promptTranslations as Record<string, string>)[studyKey] : undefined;
  const displayedPrompt = tr(record.prompt, translatedPrompt ?? record.prompt);
  const all = record.groups.flatMap((group) => group.dimensions);
  const filled = all.filter((dimension) => dimension.value);
  const byMethod = (method: DimensionMethod) => filled.filter((dimension) => dimension.method === method).length;
  const json = `/api/study-dimensions/${encodeURIComponent(record.author)}/${encodeURIComponent(record.asset)}`;
  return <section className="study-dimensions" aria-labelledby="study-dimensions-heading">
    <div className="lab-frames-heading">
      <div><p className="eyebrow">{tr("Replicable analysis", "可重現分析")}</p><h2 id="study-dimensions-heading">{tr("Study dimensions", "研究面向")}</h2></div>
      <p>{tr(`${filled.length} of ${all.length} dimensions filled`, `已填寫 ${filled.length}／${all.length} 個面向`)} · {byMethod("measured")} {tr("measured", "項測量")} · {byMethod("judged")} {tr("judged", "項判讀")} · {byMethod("metadata")} {tr("metadata", "項中繼資料")}{byMethod("ocr") ? ` · ${byMethod("ocr")} ${tr("read from frames", "項從畫面讀取")}` : ""} · {all.length - filled.length} {tr("not assessed yet", "項尚未評估")}
        {record.assessedBy && <><br />{tr("Judged dimensions", "判讀面向")}：{tr(record.assessedBy, record.assessedBy === "Claude, from the extracted slides, caption and measured timing"
          ? "Claude，依擷取畫面、貼文說明與測量時間判讀" : record.assessedBy === "Claude, from the 35 extracted slides and frame timing"
            ? "Claude，依 35 個擷取畫面與影格時間判讀" : record.assessedBy)}, {record.assessedAt}</>}</p>
    </div>
    {(record.palette.length > 0 || record.brightnessArc) && <div className="study-dimensions-visuals">
      {record.palette.length > 0 && <div><span className="detail-label">{tr("Palette", "色彩配置")}</span><div className="study-swatches">{record.palette.map((colour) =>
        <span key={colour.hex} title={`${colour.hex} · ${Math.round(colour.weight * 100)}%`}><i style={{ background: colour.hex }} />{colour.hex}</span>)}</div></div>}
      {record.brightnessArc && <div><span className="detail-label">{tr("Tonal arc", "明暗變化")}</span><div className="study-arc" role="img" aria-label={tr(`Brightness by third: ${record.brightnessArc.map((value) => `${Math.round(value * 100)}%`).join(", ")}`, `三段明暗：${record.brightnessArc.map((value) => `${Math.round(value * 100)}%`).join("、")}`)}>
        {record.brightnessArc.map((value, index) => <span key={index}><i style={{ height: `${Math.max(4, value * 100)}%` }} /><small>{[tr("Start", "起始"), tr("Middle", "中段"), tr("End", "結尾")][index]} · {Math.round(value * 100)}%</small></span>)}
      </div></div>}
    </div>}
    <div className="study-dimension-groups">
      {record.groups.map((group) => <div key={group.key} className="study-dimension-group">
        <h3>{tr(group.label, groupLabelsZh[group.key] ?? group.label)}</h3>
        <dl>{group.dimensions.map((dimension) => <div key={dimension.key} className={dimension.value ? "" : "missing"}>
          <dt>{tr(dimension.label, dimensionLabelsZh[dimension.key] ?? dimension.label)}<span className={`method method-${dimension.method}`}>{tr(methodLabels[dimension.method], ({ measured: "測量", ocr: "畫面讀取", vision: "視覺模型", judged: "判讀", metadata: "中繼資料" } as Record<DimensionMethod, string>)[dimension.method])}{dimension.confidence && dimension.value ? ` · ${tr(dimension.confidence, ({ high: "高", medium: "中", low: "低" } as const)[dimension.confidence])}` : ""}</span></dt>
          <dd>{dimension.value ? translatedValue(dimension.value) : tr("Not assessed yet", "尚未評估")}{dimension.detail && <small>{translatedValue(dimension.detail)}</small>}</dd>
        </div>)}</dl>
      </div>)}
    </div>
    {record.references.length > 0 && <div className="study-references">
      <div><span className="detail-label">{tr("Reference images", "參考圖片")}</span><p>{tr(`${record.references.length} frames published as reference images and cited in the prompt.`, `${record.references.length} 個畫面已發佈為參考圖片，並在提示詞中引用。`)}</p></div>
      <div className="study-reference-grid">{record.references.map((reference, index) => <a key={reference.id} href={reference.url} target="_blank" rel="noopener noreferrer" title={reference.url}>
        <Image src={reference.url} alt={translatedValue(reference.label)} width={reference.width} height={reference.height} sizes="120px" unoptimized loading="lazy" />
        <span>{index + 1}. {translatedValue(reference.label)}</span>
      </a>)}</div>
    </div>}
    <div className="study-prompt">
      <div className="study-prompt-head"><div><span className="detail-label">{tr("Generation prompt", "生成提示詞")}</span><p>{tr("Built from the dimensions above, for generating web assets in this style.", "依上述面向建立，可用來生成相同風格的網頁素材。")}</p></div>
        <div className="study-prompt-actions"><CopyButton text={displayedPrompt} label={tr("Copy prompt", "複製提示詞")} /><a href={json} target="_blank" rel="noopener noreferrer">{tr("Record JSON ↗", "查看 JSON 紀錄 ↗")}</a></div></div>
      <pre>{displayedPrompt}</pre>
    </div>
  </section>;
}
