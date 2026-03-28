import { InlineKeyboard, Keyboard, type Bot, type Context } from "grammy";
import { createUserRepo } from "../db/userRepo.js";
import { createAnalyticsRepo } from "../db/analyticsRepo.js";
import { createPaymentsRepo, type ProductCode, type ReceiptType } from "../db/paymentsRepo.js";
import { messages } from "./messages.js";
import { config } from "../config.js";
import { checkSubscription } from "../telegram/subscription.js";
import type { Step } from "../types.js";

type UserRepo = ReturnType<typeof createUserRepo>;
type AnalyticsRepo = ReturnType<typeof createAnalyticsRepo>;
type PaymentsRepo = ReturnType<typeof createPaymentsRepo>;

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const CB = {
  CLAIM_CONTENT: "CLAIM_CONTENT",
  CHECK_SUB: "CHECK_SUB",
  WATCHED_1: "WATCHED_1",
  WATCHED_2: "WATCHED_2",
  WATCHED_3: "WATCHED_3",
} as const;

const PRODUCT = {
  SMART_MONEY: "📚 Обучение по Smart Money",
  MENTORING: "🧑‍🏫 Личное наставничество",
  COMMUNITY: "🔒 Приватное сообщество",
} as const;

const PRODUCT_NAV = {
  BUY: "💳 Купить",
  BACK: "⬅️ Назад",
  PAYMENT_PROBLEM: "🆘 Проблема с оплатой",
} as const;

const PRODUCT_PHOTO_FILE_ID = {
  mentoring: "AgACAgIAAxkBAAIBLmlw7Frv5qWkN4__w2I1scAKS-kPAAKqEWsbKq6JS8FvTMu1srfZAQADAgADeQADOAQ",
  smart_money: "AgACAgIAAxkBAAIBL2lw7Frv0uenikwUUBleB3pJfiFiAAKrEWsbKq6JSzQnaBkbh-P6AQADAgADeQADOAQ",
  community: "AgACAgIAAxkBAAIBMGlw7FqNch22Xd2869v0Tq83VxPbAAKsEWsbKq6JS6w2xv7gKMhWAQADAgADeQADOAQ",
} as const;

const DONE_VIDEO_NOTE_FILE_ID =
  "DQACAgIAAxkBAAIBNWlw7NlKEP412NiML7vdoGe8rBbsAAJXlwACjlmIS5Zk82NpFnaqOAQ";

const PAY_CB = {
  APPROVE_PREFIX: "PAY_APPROVE:",
  REJECT_PREFIX: "PAY_REJECT:",
} as const;

function kbClaimContent() {
  return new InlineKeyboard().text("Забрать уроки", CB.CLAIM_CONTENT);
}

function kbSubscribeGate() {
  return new InlineKeyboard()
    .url("🔔 Подписаться на канал", config.channelUrl)
    .row()
    .text("✅ Я подписался", CB.CHECK_SUB);
}

function kbWatched(n: 1 | 2 | 3) {
  const data = n === 1 ? CB.WATCHED_1 : n === 2 ? CB.WATCHED_2 : CB.WATCHED_3;
  return new InlineKeyboard().text("Я посмотрел", data);
}

function kbProductsReply() {
  return new Keyboard()
    .text(PRODUCT.MENTORING)
    .text(PRODUCT.SMART_MONEY)
    .row()
    .text(PRODUCT.COMMUNITY)
    .resized();
}

function kbProductNavReply() {
  return new Keyboard().text(PRODUCT_NAV.BUY).text(PRODUCT_NAV.BACK).row().text(PRODUCT_NAV.PAYMENT_PROBLEM).resized();
}

async function sendWelcome(ctx: Context) {
  try {
    if (config.welcomeMediaType === "photo") {
      await ctx.replyWithPhoto(config.welcomeMedia);
    } else {
      await ctx.replyWithVideo(config.welcomeMedia);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(
      "Не получилось отправить приветственное медиа. Скорее всего, в .env неверный `WELCOME_MEDIA_FILE_ID_OR_URL` (испорчен file_id или не прямой https URL).\n\n" +
        `Техническая ошибка: ${msg}`
    );
  }
  await ctx.reply(messages.welcome, { reply_markup: kbClaimContent() });
}

async function sendSubscribeGate(ctx: Context) {
  await ctx.reply(messages.lessonsOverview, { reply_markup: kbSubscribeGate() });
}

async function sendLesson(ctx: Context, lesson: 1 | 2 | 3) {
  const video = config.lessonVideos[lesson - 1];
  await ctx.replyWithVideo(video);
  await ctx.reply(messages.lessonText(lesson), { reply_markup: kbWatched(lesson) });
}

function stepFromLesson(lesson: 1 | 2 | 3): Step {
  return lesson === 1 ? "lesson_1" : lesson === 2 ? "lesson_2" : "lesson_3";
}

async function ensureSubscribedOrAsk(ctx: Context, repo: UserRepo) {
  const userId = ctx.from?.id;
  if (!userId) return { ok: false as const };

  const user = repo.get(userId);
  if (!user) {
    await sendWelcome(ctx);
    return { ok: false as const };
  }

  if (user.subscribed === 1) return { ok: true as const, userId, user };

  await sendSubscribeGate(ctx);
  return { ok: false as const };
}

function isAdmin(ctx: Context) {
  const fromId = ctx.from?.id;
  if (!fromId) return false;
  if (!config.adminIds.includes(fromId)) return false;
  if (typeof config.adminChatId === "number" && ctx.chat?.id !== config.adminChatId) return false;
  return true;
}

function formatLine(e: { created_at: string; username: string | null; telegram_id: number }) {
  const u = e.username ? `@${e.username}` : `id:${e.telegram_id}`;
  return `${e.created_at} — ${u}`;
}

export function registerFunnel(bot: Bot, repo: UserRepo, analytics: AnalyticsRepo, payments: PaymentsRepo) {
  // Диагностика: чтобы быстро узнать id (нужно для ADMIN_IDS / *_CHAT_ID)
  bot.command("myid", async (ctx) => {
    await ctx.reply(`Ваш user id: ${ctx.from?.id ?? "unknown"}`);
  });

  bot.command("chatid", async (ctx) => {
    await ctx.reply(`Chat id: ${ctx.chat?.id ?? "unknown"}`);
  });

  async function sendDone(ctx: Context) {
    try {
      await ctx.replyWithVideoNote(DONE_VIDEO_NOTE_FILE_ID);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Не удалось отправить video_note перед блоком done:", e);
    }
    await ctx.reply(messages.done, { parse_mode: "Markdown", reply_markup: kbProductsReply() });
  }

  async function showProductSmartMoney(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!repo.get(userId)) repo.upsertWelcome(userId);
    repo.setUiState(userId, "product_smart_money");
    try {
      await ctx.replyWithPhoto(PRODUCT_PHOTO_FILE_ID.smart_money, {
        caption: messages.productSmartMoney,
        parse_mode: "HTML",
        reply_markup: kbProductNavReply(),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Не удалось отправить фото продукта smart_money:", e);
      await ctx.reply(messages.productSmartMoney, { reply_markup: kbProductNavReply(), parse_mode: "HTML" });
    }
  }

  async function showProductMentoring(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!repo.get(userId)) repo.upsertWelcome(userId);
    repo.setUiState(userId, "product_mentoring");
    try {
      await ctx.replyWithPhoto(PRODUCT_PHOTO_FILE_ID.mentoring, {
        caption: messages.productMentoring,
        reply_markup: kbProductNavReply(),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Не удалось отправить фото продукта mentoring:", e);
      await ctx.reply(messages.productMentoring, { reply_markup: kbProductNavReply() });
    }
  }

  async function showProductCommunity(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!repo.get(userId)) repo.upsertWelcome(userId);
    repo.setUiState(userId, "product_community");
    try {
      await ctx.replyWithPhoto(PRODUCT_PHOTO_FILE_ID.community, {
        caption: messages.productCommunity,
        reply_markup: kbProductNavReply(),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Не удалось отправить фото продукта community:", e);
      await ctx.reply(messages.productCommunity, { reply_markup: kbProductNavReply() });
    }
  }

  async function sendToAdmins(text: string) {
    if (typeof config.adminChatId === "number") {
      await bot.api.sendMessage(config.adminChatId, text);
      return;
    }
    for (const adminId of config.adminIds) {
      await bot.api.sendMessage(adminId, text);
    }
  }

  bot.command("reset", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Сброс делаем через upsertWelcome (он обнуляет lesson/subscribed/ui_state).
    repo.upsertWelcome(userId);
    await ctx.reply("Сбросил прогресс. Запускаю сценарий заново.");
    await sendWelcome(ctx);
  });

  bot.command("reset_all", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const allowed = config.adminIds.includes(userId);
    if (!allowed) {
      await ctx.reply("Нет доступа. Для /reset_all добавьте ваш id в ADMIN_IDS.");
      return;
    }

    repo.resetAll();
    await ctx.reply("Ок, сбросил прогресс всех пользователей.");
  });

  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const existing = repo.get(userId);
    if (!existing) {
      repo.upsertWelcome(userId);
      await sendWelcome(ctx);
      return;
    }

    // Если пользователь уже в уроках — продолжаем с текущего шага.
    if (existing.step === "lesson_1") return void (await sendLesson(ctx, 1));
    if (existing.step === "lesson_2") return void (await sendLesson(ctx, 2));
    if (existing.step === "lesson_3") return void (await sendLesson(ctx, 3));
    if (existing.step === "done") {
      await sendDone(ctx);
      return;
    }

    repo.setStep(userId, "welcome");
    await sendWelcome(ctx);
  });

  bot.callbackQuery(CB.CLAIM_CONTENT, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!repo.get(userId)) repo.upsertWelcome(userId);
    repo.setStep(userId, "subscribe_gate");

    // Аналитика: кто нажал "Забрать уроки"
    analytics.logClaimEvent({
      telegramId: userId,
      username: ctx.from?.username ?? null,
    });

    await sendSubscribeGate(ctx);
  });

  bot.callbackQuery(CB.CHECK_SUB, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!repo.get(userId)) repo.upsertWelcome(userId);

    const res = await checkSubscription({
      api: ctx.api,
      channelIdOrUsername: config.channelIdOrUsername,
      userId,
    });

    if (!res.ok) {
      await ctx.reply(res.error, { reply_markup: kbSubscribeGate() });
      return;
    }

    if (!res.subscribed) {
      await ctx.reply(messages.notSubscribed, { reply_markup: kbSubscribeGate() });
      return;
    }

    repo.setSubscribed(userId, true);

    const user = repo.get(userId);
    if (!user) return;

    // Если уже начал уроки — продолжаем с текущего урока.
    if (user.lesson === 2) return void (await sendLesson(ctx, 2));
    if (user.lesson === 3) return void (await sendLesson(ctx, 3));
    if (user.step === "done") return void (await sendDone(ctx));

    // Иначе начинаем с урока 1.
    repo.setLesson(userId, 1);
    repo.setStep(userId, stepFromLesson(1));
    await sendLesson(ctx, 1);
  });

  async function handleWatched(ctx: Context, watchedLesson: 1 | 2 | 3) {
    await ctx.answerCallbackQuery();
    const ok = await ensureSubscribedOrAsk(ctx, repo);
    if (!ok.ok) return;

    const { userId } = ok;
    const user = repo.get(userId);
    if (!user) return;

    // Идемпотентность/защита от пропусков: если нажали "я посмотрел" не на своём уроке —
    // просто повторно отправим актуальный урок.
    if (user.lesson !== watchedLesson) {
      const current = (user.lesson === 0 ? 1 : user.lesson) as 1 | 2 | 3;
      await sendLesson(ctx, current);
      return;
    }

    if (watchedLesson === 3) {
      repo.markDone(userId);
      await sendDone(ctx);
      return;
    }

    repo.advanceLesson(userId);
    const next = (watchedLesson + 1) as 2 | 3;
    repo.setStep(userId, stepFromLesson(next));
    await sendLesson(ctx, next);
  }

  bot.callbackQuery(CB.WATCHED_1, (ctx) => handleWatched(ctx, 1));
  bot.callbackQuery(CB.WATCHED_2, (ctx) => handleWatched(ctx, 2));
  bot.callbackQuery(CB.WATCHED_3, (ctx) => handleWatched(ctx, 3));

  bot.hears(PRODUCT.SMART_MONEY, (ctx) => showProductSmartMoney(ctx));

  bot.hears(PRODUCT.MENTORING, async (ctx) => {
    await showProductMentoring(ctx);
  });

  bot.hears(PRODUCT.COMMUNITY, (ctx) => showProductCommunity(ctx));

  bot.hears(PRODUCT_NAV.BACK, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!repo.get(userId)) repo.upsertWelcome(userId);
    repo.setUiState(userId, null);
    await ctx.reply("Выберите формат обучения:", { reply_markup: kbProductsReply() });
  });

  bot.hears(PRODUCT_NAV.PAYMENT_PROBLEM, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!repo.get(userId)) repo.upsertWelcome(userId);

    const user = repo.get(userId);
    const paymentId = parseAwaitReceiptUi(user?.ui_state ?? null);

    if (!paymentId) {
      await ctx.reply("Эта кнопка доступна на этапе оплаты. Нажмите «Купить», чтобы получить реквизиты.", {
        reply_markup: kbProductNavReply(),
      });
      return;
    }

    await ctx.reply("Если возникла проблема с оплатой — напишите, пожалуйста, @bollshoybrat.", {
      reply_markup: kbProductNavReply(),
    });
  });

  function getProductFromUi(ui: string | null): ProductCode | null {
    if (ui === "product_smart_money") return "smart_money";
    if (ui === "product_mentoring") return "mentoring";
    if (ui === "product_community") return "community";
    return null;
  }

  function productAmounts(product: ProductCode) {
    if (product === "smart_money") return { rub: "9 990 ₽", usdt: "120 USDT" };
    if (product === "community") return { rub: "3 490 ₽", usdt: "45 USDT" };
    return { rub: "200 000 ₽", usdt: "2500 USDT" };
  }

  function paymentInstructions(product: ProductCode) {
    const a = productAmounts(product);
    const wallet = config.trc20Wallet ?? "—";
    const card = config.bankCardNumber ?? "—";
    const title =
      product === "smart_money"
        ? "Обучение по Smart Money"
        : product === "community"
          ? "Закрытый канал с сигналами"
          : "Личное наставничество";

    return (
      `Оплата: ${title}\n` +
      `Сумма: ${a.rub} (или ${a.usdt})\n\n` +
      "Реквизиты оплаты:\n" +
      `TRC20: <code>${escapeHtml(wallet)}</code>\n` +
      `Банковская карта: ${card}\n\n` +
      "После оплаты отправьте сюда фотографию перевода/чека или файл (pdf/скрин) одним сообщением."
    );
  }

  async function notifyAdminsOfReceipt(args: {
    paymentId: number;
    userId: number;
    username: string | null;
    product: ProductCode;
    amountRub: string;
    amountUsdt: string;
    receiptFileId: string;
    receiptType: ReceiptType;
  }) {
    const u = args.username ? `@${args.username}` : `id:${args.userId}`;
    const caption =
      "Новый чек на проверку\n\n" +
      `Платёж #${args.paymentId}\n` +
      `Пользователь: ${u}\n` +
      `Товар: ${args.product}\n` +
      `Сумма: ${args.amountRub} (или ${args.amountUsdt})\n`;

    const kb = new InlineKeyboard()
      .text("✅ Подтвердить", `${PAY_CB.APPROVE_PREFIX}${args.paymentId}`)
      .text("❌ Отказать", `${PAY_CB.REJECT_PREFIX}${args.paymentId}`);

    const send = async (chatId: number) => {
      if (args.receiptType === "document") {
        await bot.api.sendDocument(chatId, args.receiptFileId, { caption, reply_markup: kb });
      } else {
        await bot.api.sendPhoto(chatId, args.receiptFileId, { caption, reply_markup: kb });
      }
    };

    if (typeof config.adminChatId === "number") {
      await send(config.adminChatId);
      return;
    }

    // Если ADMIN_CHAT_ID не задан — шлём каждому админу в личку.
    for (const adminId of config.adminIds) {
      await send(adminId);
    }
  }

  function parseAwaitReceiptUi(ui: string | null): number | null {
    if (!ui) return null;
    const m = ui.match(/^await_receipt:(\d+)$/);
    if (!m) return null;
    return Number(m[1]);
  }

  async function issueInviteLink(args: { chatId: number; userId: number; label: string }) {
    const link = await bot.api.createChatInviteLink(args.chatId, { member_limit: 1 });
    await bot.api.sendMessage(
      args.userId,
      `Оплата обработана.\n\nОдноразовая ссылка для ${args.label} (1 активация):\n${link.invite_link}`
    );
  }

  bot.hears(PRODUCT_NAV.BUY, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!repo.get(userId)) repo.upsertWelcome(userId);

    const user = repo.get(userId);
    const ui = user?.ui_state ?? null;
    const product = getProductFromUi(ui);

    if (!product) {
      await ctx.reply("Сначала выберите тариф (кнопки внизу), затем нажмите «Купить».", { reply_markup: kbProductsReply() });
      return;
    }

    if (!config.trc20Wallet || !config.bankCardNumber) {
      await ctx.reply("Платёжные реквизиты не настроены. Админ, добавь TRC20_WALLET и BANK_CARD_NUMBER в .env.");
      await sendToAdmins("Нужно настроить реквизиты: TRC20_WALLET и BANK_CARD_NUMBER в .env (пользователь нажал «Купить»).");
      return;
    }

    const a = productAmounts(product);
    const pr = payments.create({
      telegramId: userId,
      username: ctx.from?.username ?? null,
      product,
      amountRub: a.rub,
      amountUsdt: a.usdt,
    });

    if (!pr) {
      await ctx.reply("Не смог создать заявку на оплату. Попробуйте ещё раз позже.");
      return;
    }

    repo.setUiState(userId, `await_receipt:${pr.id}`);
    await ctx.reply(paymentInstructions(product), { reply_markup: kbProductNavReply(), parse_mode: "HTML" });
  });

  async function handleReceipt(ctx: Context, receiptType: ReceiptType, receiptFileId: string, receiptMessageId: number) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = repo.get(userId);
    const paymentId = parseAwaitReceiptUi(user?.ui_state ?? null);
    if (!paymentId) return;

    const pr = payments.get(paymentId);
    if (!pr || pr.telegram_id !== userId) {
      repo.setUiState(userId, null);
      await ctx.reply("Не нашёл активную заявку на оплату. Нажмите «Купить» ещё раз.", { reply_markup: kbProductsReply() });
      return;
    }

    if (pr.status !== "awaiting_receipt") {
      repo.setUiState(userId, null);
      await ctx.reply("Эта заявка уже отправлена на проверку. Если нужно — создайте новую через «Купить».", {
        reply_markup: kbProductsReply(),
      });
      return;
    }

    const updated = payments.attachReceipt({
      id: pr.id,
      receiptFileId: receiptFileId,
      receiptType,
      receiptMessageId,
    });

    repo.setUiState(userId, null);
    await ctx.reply("Чек получил. Передал на проверку, напишу, как только оплата будет подтверждена.", {
      reply_markup: kbProductsReply(),
    });

    if (updated) {
      await notifyAdminsOfReceipt({
        paymentId: updated.id,
        userId: updated.telegram_id,
        username: updated.username,
        product: updated.product,
        amountRub: updated.amount_rub,
        amountUsdt: updated.amount_usdt,
        receiptFileId: updated.receipt_file_id ?? receiptFileId,
        receiptType: updated.receipt_type ?? receiptType,
      });
    }
  }

  bot.on("message:photo", async (ctx) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    await handleReceipt(ctx, "photo", photo.file_id, ctx.message.message_id);
  });

  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    await handleReceipt(ctx, "document", doc.file_id, ctx.message.message_id);
  });

  bot.callbackQuery(/PAY_(APPROVE|REJECT):\d+/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isAdmin(ctx)) {
      await ctx.reply("Нет доступа.");
      return;
    }

    const data = ctx.callbackQuery.data;
    const isApprove = data.startsWith(PAY_CB.APPROVE_PREFIX);
    const idStr = data.replace(isApprove ? PAY_CB.APPROVE_PREFIX : PAY_CB.REJECT_PREFIX, "");
    const paymentId = Number(idStr);
    if (!Number.isFinite(paymentId)) return;

    const pr = payments.get(paymentId);
    if (!pr) {
      await ctx.reply(`Платёж #${paymentId} не найден.`);
      return;
    }

    if (pr.status === "approved" || pr.status === "rejected") {
      await ctx.reply(`Платёж #${paymentId} уже обработан (status=${pr.status}).`);
      return;
    }

    const decided = payments.decide({
      id: paymentId,
      status: isApprove ? "approved" : "rejected",
      adminId: ctx.from!.id,
    });

    if (!decided) return;

    if (!isApprove) {
      await bot.api.sendMessage(pr.telegram_id, "Оплату не смог подтвердить. Пришлите, пожалуйста, более чёткое фото чека или уточните детали у администратора.");
      await ctx.reply(`Ок, отказал по платежу #${paymentId}.`);
      return;
    }

    // approve flow
    try {
      if (pr.product === "community") {
        if (!config.communityChatId) {
          await bot.api.sendMessage(pr.telegram_id, "Оплата подтверждена. Ссылка на чат пока не настроена — администратор свяжется с вами.");
          await sendToAdmins("COMMUNITY_CHAT_ID не задан в .env — не могу выдать инвайт после подтверждения оплаты.");
        } else {
          await issueInviteLink({ chatId: config.communityChatId, userId: pr.telegram_id, label: "приватного сообщества" });
        }
      } else if (pr.product === "smart_money") {
        if (!config.coursesChatId) {
          await bot.api.sendMessage(pr.telegram_id, "Оплата подтверждена. Ссылка на чат с курсом пока не настроена — администратор свяжется с вами.");
          await sendToAdmins("COURSES_CHAT_ID не задан в .env — не могу выдать инвайт после подтверждения оплаты.");
        } else {
          await issueInviteLink({ chatId: config.coursesChatId, userId: pr.telegram_id, label: "курсов" });
        }
      } else {
        await bot.api.sendMessage(pr.telegram_id, "Оплата подтверждена. Скоро с вами свяжется администратор.");
      }

      await ctx.reply(`Ок, подтвердил платёж #${paymentId}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`Не смог выдать доступ/ссылку по платежу #${paymentId}: ${msg}`);
      await bot.api.sendMessage(pr.telegram_id, "Оплата подтверждена, но возникла техническая ошибка при выдаче доступа. Администратор свяжется с вами.");
    }
  });

  bot.command("claim_stats", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("Нет доступа.");
      return;
    }

    const summary = analytics.getClaimSummary();
    const events = analytics.listRecentClaimEvents(200);

    const header =
      "Статистика по нажатию «Забрать уроки»\n\n" +
      `Всего кликов: ${summary.totalClicks}\n` +
      `Уникальных пользователей: ${summary.uniqueUsers}\n\n` +
      "Последние 200 событий:\n";

    // Разбиваем на чанки, чтобы не упереться в лимит 4096.
    let chunk = header;
    for (const e of events) {
      const line = formatLine(e) + "\n";
      if (chunk.length + line.length > 3900) {
        await ctx.reply(chunk);
        chunk = "";
      }
      chunk += line;
    }
    if (chunk.trim().length > 0) await ctx.reply(chunk);
  });
}

