const asOptional = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asBoolean = (value, fallback = false) => {
  if (typeof value === "undefined" || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const defaultEmbeddingModel = "text-embedding-3-small";
const defaultTranscriptionModel = "whisper-1";

const asNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const env = {
  databaseUrl: asOptional(process.env.DATABASE_URL),
  vimeoAccessToken: asOptional(process.env.VIMEO_ACCESS_TOKEN),
  openaiApiKey: asOptional(process.env.OPENAI_API_KEY),
  openaiEmbeddingModel: asOptional(process.env.OPENAI_EMBEDDING_MODEL) || defaultEmbeddingModel,
  openaiTranscriptionModel: asOptional(process.env.OPENAI_TRANSCRIPTION_MODEL) || defaultTranscriptionModel,
  googleClientId: asOptional(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: asOptional(process.env.GOOGLE_CLIENT_SECRET),
  nextAuthUrl: asOptional(process.env.NEXTAUTH_URL),
  nextAuthSecret: asOptional(process.env.NEXTAUTH_SECRET),
  allowedGoogleDomain: asOptional(process.env.ALLOWED_GOOGLE_DOMAIN),
  enableSyncFileLogs: asBoolean(process.env.ENABLE_SYNC_FILE_LOGS, true),
  transcriptionDownloadTimeoutMs: asNumber(process.env.TRANSCRIPTION_DOWNLOAD_TIMEOUT_MS, 120000),
  transcriptionCommandTimeoutMs: asNumber(process.env.TRANSCRIPTION_COMMAND_TIMEOUT_MS, 180000),
  openaiTranscriptionTimeoutMs: asNumber(process.env.OPENAI_TRANSCRIPTION_TIMEOUT_MS, 180000)
};

export const hasVimeoToken = () => Boolean(env.vimeoAccessToken);
export const hasOpenAiKey = () => Boolean(env.openaiApiKey);
