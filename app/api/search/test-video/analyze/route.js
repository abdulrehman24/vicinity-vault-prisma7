import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { VimeoClient } from "@/src/server/services/vimeo-client";
import { AdminAiConfigService } from "@/src/server/services/admin-ai-config-service";
import { OpenAiService } from "@/src/server/services/openai-service";
import { decryptSecret } from "@/src/server/security/secrets";

export const runtime = "nodejs";

const extractVimeoId = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i) || raw.match(/\/(\d+)(?:\/|$|\?)/);
  return match?.[1] || null;
};

const extractJsonObject = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const getClientForSource = async (sourceId) => {
  const normalized = String(sourceId || "").trim();
  if (!normalized) return { client: new VimeoClient(), source: null };

  const source = await prisma.data_sources.findFirst({
    where: { id: normalized, platform: "vimeo" },
    select: { id: true, name: true, access_token_encrypted: true }
  });
  if (!source) {
    throw new Error("Selected Vimeo source was not found.");
  }

  const token = decryptSecret(source.access_token_encrypted);
  if (!token) {
    throw new Error(`Source "${source.name}" has no valid Vimeo token.`);
  }
  return { client: new VimeoClient(token), source };
};

export async function POST(request) {
  try {
    await resolveCurrentUser(prisma);
    const body = await request.json().catch(() => ({}));
    const sourceId = String(body?.sourceId || "").trim();
    const vimeoId = extractVimeoId(String(body?.vimeoId || ""));
    if (!vimeoId) {
      return NextResponse.json({ error: "Please provide a valid Vimeo ID or Vimeo URL." }, { status: 400 });
    }

    const { client, source } = await getClientForSource(sourceId);
    const video = await client.getVideoById(vimeoId);
    const mediaUrl = video?.raw?.download?.[0]?.link || null;
    if (!mediaUrl) {
      return NextResponse.json(
        { error: "No downloadable media URL available for this Vimeo video." },
        { status: 400 }
      );
    }

    const runtimeAi = await new AdminAiConfigService({ prisma }).getRuntimeConfig();
    const openai = new OpenAiService({
      apiKey: runtimeAi.openAiApiKey,
      embeddingModel: runtimeAi.embeddingModel,
      transcriptionModel: runtimeAi.transcriptionModel
    });
    if (!openai.isConfigured()) {
      return NextResponse.json({ error: "OpenAI key is not configured." }, { status: 400 });
    }

    const transcription = await openai.transcribeFromUrl({
      mediaUrl,
      filename: `${vimeoId}.mp4`
    });

    const transcriptText = String(transcription?.text || "").trim();
    const model = String(runtimeAi.explanationModel || "gpt-5-nano");
    const completion = await openai.client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Classify the video's primary industry from title/description/transcript. Return strict JSON object: {\"industry\":\"...\",\"confidence\":0-1,\"reason\":\"...\"}."
        },
        {
          role: "user",
          content: JSON.stringify({
            title: video?.title || "",
            description: video?.description || "",
            transcript: transcriptText.slice(0, 4000)
          })
        }
      ]
    });

    const rawResponse = completion?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonObject(rawResponse);

    return NextResponse.json({
      vimeoId,
      sourceId: source?.id || sourceId || null,
      sourceName: source?.name || null,
      model,
      transcriptPreview: transcriptText.slice(0, 500),
      transcriptLength: transcriptText.length,
      classification: parsed,
      rawResponse
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "OpenAI analysis failed." }, { status: 500 });
  }
}

