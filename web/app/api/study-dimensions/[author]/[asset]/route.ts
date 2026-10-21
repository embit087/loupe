import { NextResponse } from "next/server";
import { getLabStudy } from "@/lib/experiment-lab";
import { getPersistedLabAnalysis } from "@/lib/lab-analysis";
import { getStudyDimensions } from "@/lib/study-dimensions";

// The study-dimensions record as JSON, for code agents and generation pipelines.
export async function GET(_request: Request, { params }: { params: Promise<{ author: string; asset: string }> }) {
  const { author, asset } = await params;
  const study = getLabStudy(author, asset);
  if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });
  return NextResponse.json(getStudyDimensions(study, await getPersistedLabAnalysis(study)));
}
