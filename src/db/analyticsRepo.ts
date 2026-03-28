function nowIso() {
  return new Date().toISOString();
}

export type ClaimEventRow = {
  id: number;
  telegram_id: number;
  username: string | null;
  created_at: string;
};

export function createAnalyticsRepo(db: any) {
  const insertClaimStmt = db.prepare(
    `INSERT INTO claim_events (telegram_id, username, created_at)
     VALUES (@telegram_id, @username, @created_at)`
  );

  const listRecentStmt = db.prepare(
    `SELECT id, telegram_id, username, created_at
     FROM claim_events
     ORDER BY id DESC
     LIMIT ?`
  );

  const totalClicksStmt = db.prepare(`SELECT COUNT(*) as cnt FROM claim_events`);
  const uniqueUsersStmt = db.prepare(`SELECT COUNT(DISTINCT telegram_id) as cnt FROM claim_events`);

  return {
    logClaimEvent(args: { telegramId: number; username: string | null }) {
      insertClaimStmt.run({
        telegram_id: args.telegramId,
        username: args.username,
        created_at: nowIso(),
      });
    },

    getClaimSummary() {
      const total = (totalClicksStmt.get() as any)?.cnt as number;
      const unique = (uniqueUsersStmt.get() as any)?.cnt as number;
      return { totalClicks: total ?? 0, uniqueUsers: unique ?? 0 };
    },

    listRecentClaimEvents(limit: number) {
      return listRecentStmt.all(limit) as ClaimEventRow[];
    },
  };
}

