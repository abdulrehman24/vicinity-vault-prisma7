const asOptional = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const defaultEmbeddingModel = "text-embedding-3-small";
const defaultTranscriptionModel = "whisper-1";

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
  allowedGoogleDomain: asOptional(process.env.ALLOWED_GOOGLE_DOMAIN)
};

export const hasVimeoToken = () => Boolean(env.vimeoAccessToken);
export const hasOpenAiKey = () => Boolean(env.openaiApiKey);
