import { Bot } from "grammy";
import { config } from "./config.js";
import { openDb } from "./db/sqlite.js";
import { createUserRepo } from "./db/userRepo.js";
import { createAnalyticsRepo } from "./db/analyticsRepo.js";
import { createPaymentsRepo } from "./db/paymentsRepo.js";
import { registerFunnel } from "./flows/funnel.js";

const bot = new Bot(config.botToken);

// Вспомогательный режим: получить file_id для фото/видео именно ДЛЯ ЭТОГО БОТА.
// Включение: DEBUG_FILE_ID=1
if (process.env.DEBUG_FILE_ID === "1") {
  type ReplyCtx = { reply: (text: string) => Promise<unknown> };
  const replyFileId = async (
    ctx: ReplyCtx,
    label: string,
    fileId: string,
    uniqueFileId?: string,
  ) => {
    const lines = [`${label}.file_id: ${fileId}`];
    if (uniqueFileId) lines.push(`${label}.unique_file_id: ${uniqueFileId}`);
    await ctx.reply(lines.join("\n"));
  };

  bot.on("message:photo", async (ctx) => {
    const p = ctx.message.photo[ctx.message.photo.length - 1];
    await replyFileId(ctx, "photo", p.file_id, p.file_unique_id);
  });

  bot.on("message:video", async (ctx) => {
    const v = ctx.message.video;
    await replyFileId(ctx, "video", v.file_id, v.file_unique_id);
  });

  bot.on("message:document", async (ctx) => {
    const d = ctx.message.document;
    await replyFileId(ctx, "document", d.file_id, d.file_unique_id);
  });

  bot.on("message:audio", async (ctx) => {
    const a = ctx.message.audio;
    await replyFileId(ctx, "audio", a.file_id, a.file_unique_id);
  });

  bot.on("message:voice", async (ctx) => {
    const v = ctx.message.voice;
    await replyFileId(ctx, "voice", v.file_id, v.file_unique_id);
  });

  bot.on("message:video_note", async (ctx) => {
    const vn = ctx.message.video_note;
    await replyFileId(ctx, "video_note", vn.file_id, vn.file_unique_id);
  });

  bot.on("message:animation", async (ctx) => {
    const a = ctx.message.animation;
    await replyFileId(ctx, "animation", a.file_id, a.file_unique_id);
  });

  bot.on("message:sticker", async (ctx) => {
    const s = ctx.message.sticker;
    await replyFileId(ctx, "sticker", s.file_id, s.file_unique_id);
  });
}

const db = openDb(config.sqlitePath);
const repo = createUserRepo(db);
const analytics = createAnalyticsRepo(db);
const payments = createPaymentsRepo(db);

registerFunnel(bot, repo, analytics, payments);

bot.catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Bot error:", err.error);
});

await bot.start({
  onStart: (info) => {
    // eslint-disable-next-line no-console
    console.log(`Bot started as @${info.username}`);
  },
});

