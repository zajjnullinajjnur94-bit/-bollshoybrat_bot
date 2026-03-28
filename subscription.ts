import type { Api } from "grammy";

export type SubscriptionResult =
  | { ok: true; subscribed: boolean }
  | { ok: false; error: string };

export async function checkSubscription(args: {
  api: Api;
  channelIdOrUsername: string;
  userId: number;
}): Promise<SubscriptionResult> {
  try {
    const member = await args.api.getChatMember(args.channelIdOrUsername, args.userId);
    // Для каналов важно отличать left/kicked.
    const subscribed = member.status !== "left" && member.status !== "kicked";
    return { ok: true, subscribed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error:
        "Не смог проверить подписку через Telegram API. Проверьте, что бот добавлен админом канала и CHANNEL_ID_OR_USERNAME указан верно.\n\n" +
        `Детали: ${msg}`,
    };
  }
}

