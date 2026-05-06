import test from "node:test";
import assert from "node:assert/strict";
import { AdminVideoService } from "../admin-video-service.js";
import { VimeoClient } from "../vimeo-client.js";
import { encryptSecret } from "../../security/secrets.js";
import { AdminAiConfigService } from "../admin-ai-config-service.js";
import { EmbeddingService } from "../embedding-service.js";

const makeVideo = () => ({
  id: "video-1",
  vimeo_video_id: "12345",
  title: "Old Title",
  description: "Old Description",
  folder_name: "Folder",
  privacy_view: "unlisted",
  metadata_json: { raw: {} },
  data_source: {
    id: "source-1",
    name: "Source",
    access_token_encrypted: encryptSecret("token-1")
  },
  video_tags: [{ tag: "old_tag" }],
  transcripts: [{ raw_text: "sample transcript" }]
});

test("video update validates unsupported fields", async () => {
  const service = new AdminVideoService({ prisma: {} });
  assert.throws(() => service.validatePatchInput({ vimeo: { unsupported: "x" } }), /Unsupported Vimeo field/);
});

test("video update normalizes tags", async () => {
  const service = new AdminVideoService({ prisma: {} });
  const parsed = service.validatePatchInput({
    vimeo: { tags: [" tech ", "tech", "  iot  "] }
  });
  assert.deepEqual(parsed.vimeo.tags, ["tech", "iot"]);
});

test("local DB not updated if Vimeo update fails", async () => {
  let transactionCalled = false;
  const prisma = {
    videos: {
      findUnique: async () => makeVideo()
    },
    $transaction: async () => {
      transactionCalled = true;
    }
  };
  const service = new AdminVideoService({ prisma });
  const original = VimeoClient.prototype.updateVideoMetadata;
  VimeoClient.prototype.updateVideoMetadata = async () => {
    throw new Error("vimeo fail");
  };
  try {
    await assert.rejects(
      service.updateVideo({
        id: "video-1",
        input: { vimeo: { title: "New Title" } },
        adminUserId: "admin-1"
      }),
      /vimeo fail/
    );
    assert.equal(transactionCalled, false);
  } finally {
    VimeoClient.prototype.updateVideoMetadata = original;
  }
});

test("local DB updates after Vimeo success and embedding rebuild is triggered", async () => {
  let transactionCalled = false;
  let embedCalled = false;
  const prisma = {
    videos: {
      findUnique: async () => makeVideo(),
      update: async ({ data }) => ({ ...makeVideo(), ...data, id: "video-1" })
    },
    video_tags: {
      deleteMany: async () => {},
      createMany: async () => {}
    },
    $transaction: async (fn) => {
      transactionCalled = true;
      return fn(prisma);
    },
    data_sources: { findMany: async () => [] }
  };

  const service = new AdminVideoService({ prisma });
  const originalMeta = VimeoClient.prototype.updateVideoMetadata;
  const originalTags = VimeoClient.prototype.replaceVideoTags;
  const originalCfg = AdminAiConfigService.prototype.getRuntimeConfig;
  const originalEmbed = EmbeddingService.prototype.embedVideo;

  VimeoClient.prototype.updateVideoMetadata = async () => ({ skipped: false });
  VimeoClient.prototype.replaceVideoTags = async () => ({ applied: true, added: [], removed: [], finalTags: ["new"] });
  AdminAiConfigService.prototype.getRuntimeConfig = async () => ({
    openAiApiKey: "key",
    embeddingModel: "text-embedding-3-small",
    transcriptionModel: "gpt-4o-mini-transcribe"
  });
  EmbeddingService.prototype.embedVideo = async () => {
    embedCalled = true;
    return { skipped: false };
  };

  try {
    const result = await service.updateVideo({
      id: "video-1",
      input: { vimeo: { title: "New Title", description: "New", tags: ["new"] } },
      adminUserId: "admin-1"
    });
    assert.equal(transactionCalled, true);
    assert.equal(embedCalled, true);
    assert.ok(result.video);
  } finally {
    VimeoClient.prototype.updateVideoMetadata = originalMeta;
    VimeoClient.prototype.replaceVideoTags = originalTags;
    AdminAiConfigService.prototype.getRuntimeConfig = originalCfg;
    EmbeddingService.prototype.embedVideo = originalEmbed;
  }
});
