import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  CHANNEL_ID_OR_USERNAME: z.string().min(1),
  CHANNEL_URL: z.string().url(),

  WELCOME_MEDIA_TYPE: z.enum(["photo", "video"]),
  WELCOME_MEDIA_FILE_ID_OR_URL: z.string().min(1),

  LESSON1_VIDEO_FILE_ID_OR_URL: z.string().min(1),
  LESSON2_VIDEO_FILE_ID_OR_URL: z.string().min(1),
  LESSON3_VIDEO_FILE_ID_OR_URL: z.string().min(1),

  SQLITE_PATH: z.string().optional(),
  ADMIN_IDS: z.string().optional(),
  ADMIN_CHAT_ID: z.string().optional(),

  COMMUNITY_URL: z.string().url().optional(),
  TRAINING_URL: z.string().url().optional(),
  PERSONAL_TRAINING_URL: z.string().url().optional(),
  MENTORING_URL: z.string().url().optional(),

  TRC20_WALLET: z.string().optional(),
  BANK_CARD_NUMBER: z.string().optional(),

  COMMUNITY_CHAT_ID: z.string().optional(),
  COURSES_CHAT_ID: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Некорректные переменные окружения:", parsed.error.flatten().fieldErrors);
  throw new Error("Config validation failed");
}

const env = parsed.data;

function parseAdminIds(raw?: string): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseAdminChatId(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseChatId(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export const config = {
  botToken: env.BOT_TOKEN,
  channelIdOrUsername: env.CHANNEL_ID_OR_USERNAME,
  channelUrl: env.CHANNEL_URL,

  welcomeMediaType: env.WELCOME_MEDIA_TYPE,
  welcomeMedia: env.WELCOME_MEDIA_FILE_ID_OR_URL,

  lessonVideos: [
    env.LESSON1_VIDEO_FILE_ID_OR_URL,
    env.LESSON2_VIDEO_FILE_ID_OR_URL,
    env.LESSON3_VIDEO_FILE_ID_OR_URL,
  ] as const,

  sqlitePath: env.SQLITE_PATH
    ? path.resolve(env.SQLITE_PATH)
    : path.resolve(process.cwd(), "data", "bot.sqlite"),

  adminIds: parseAdminIds(env.ADMIN_IDS),
  adminChatId: parseAdminChatId(env.ADMIN_CHAT_ID),

  communityUrl: env.COMMUNITY_URL,
  trainingUrl: env.TRAINING_URL ?? env.PERSONAL_TRAINING_URL,
  personalTrainingUrl: env.PERSONAL_TRAINING_URL,
  mentoringUrl: env.MENTORING_URL,

  trc20Wallet: env.TRC20_WALLET,
  bankCardNumber: env.BANK_CARD_NUMBER,

  communityChatId: parseChatId(env.COMMUNITY_CHAT_ID),
  coursesChatId: parseChatId(env.COURSES_CHAT_ID),
};

