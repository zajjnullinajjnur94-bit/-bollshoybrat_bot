import type { Step, UserRow } from "../types.js";

function nowIso() {
  return new Date().toISOString();
}

export function createUserRepo(db: any) {
  const getStmt = db.prepare(
    `SELECT telegram_id, step, subscribed, lesson, ui_state, created_at, updated_at
     FROM users
     WHERE telegram_id = ?`
  );

  const upsertStmt = db.prepare(
    `INSERT INTO users (telegram_id, step, subscribed, lesson, ui_state, created_at, updated_at)
     VALUES (@telegram_id, @step, @subscribed, @lesson, @ui_state, @created_at, @updated_at)
     ON CONFLICT(telegram_id) DO UPDATE SET
       step = excluded.step,
       subscribed = excluded.subscribed,
       lesson = excluded.lesson,
       ui_state = excluded.ui_state,
       updated_at = excluded.updated_at`
  );

  const updateStepStmt = db.prepare(
    `UPDATE users
     SET step = @step, updated_at = @updated_at
     WHERE telegram_id = @telegram_id`
  );

  const updateSubscribedStmt = db.prepare(
    `UPDATE users
     SET subscribed = @subscribed, updated_at = @updated_at
     WHERE telegram_id = @telegram_id`
  );

  const updateLessonStmt = db.prepare(
    `UPDATE users
     SET lesson = @lesson, step = @step, updated_at = @updated_at
     WHERE telegram_id = @telegram_id`
  );

  const updateUiStateStmt = db.prepare(
    `UPDATE users
     SET ui_state = @ui_state, updated_at = @updated_at
     WHERE telegram_id = @telegram_id`
  );

  const advanceLessonStmt = db.prepare(
    `UPDATE users
     SET lesson = CASE WHEN lesson < 3 THEN lesson + 1 ELSE 3 END,
         step = CASE
           WHEN lesson + 1 = 1 THEN 'lesson_1'
           WHEN lesson + 1 = 2 THEN 'lesson_2'
           WHEN lesson + 1 = 3 THEN 'lesson_3'
           ELSE step
         END,
         updated_at = @updated_at
     WHERE telegram_id = @telegram_id`
  );

  const markDoneStmt = db.prepare(
    `UPDATE users
     SET step = 'done', updated_at = @updated_at
     WHERE telegram_id = @telegram_id`
  );

  const deleteUserStmt = db.prepare(
    `DELETE FROM users
     WHERE telegram_id = ?`
  );

  const deleteAllStmt = db.prepare(`DELETE FROM users`);

  return {
    get(telegramId: number) {
      return getStmt.get(telegramId) as UserRow | undefined;
    },

    upsertWelcome(telegramId: number) {
      const ts = nowIso();
      upsertStmt.run({
        telegram_id: telegramId,
        step: "welcome" satisfies Step,
        subscribed: 0,
        lesson: 0,
        ui_state: null,
        created_at: ts,
        updated_at: ts,
      });
      return this.get(telegramId);
    },

    setStep(telegramId: number, step: Step) {
      updateStepStmt.run({ telegram_id: telegramId, step, updated_at: nowIso() });
      return this.get(telegramId);
    },

    setSubscribed(telegramId: number, subscribed: boolean) {
      updateSubscribedStmt.run({
        telegram_id: telegramId,
        subscribed: subscribed ? 1 : 0,
        updated_at: nowIso(),
      });
      return this.get(telegramId);
    },

    setLesson(telegramId: number, lesson: 0 | 1 | 2 | 3) {
      const step: Step =
        lesson === 1 ? "lesson_1" : lesson === 2 ? "lesson_2" : lesson === 3 ? "lesson_3" : "welcome";

      updateLessonStmt.run({
        telegram_id: telegramId,
        lesson,
        step,
        updated_at: nowIso(),
      });
      return this.get(telegramId);
    },

    advanceLesson(telegramId: number) {
      advanceLessonStmt.run({ telegram_id: telegramId, updated_at: nowIso() });
      return this.get(telegramId);
    },

    markDone(telegramId: number) {
      markDoneStmt.run({ telegram_id: telegramId, updated_at: nowIso() });
      return this.get(telegramId);
    },

    setUiState(telegramId: number, uiState: string | null) {
      updateUiStateStmt.run({
        telegram_id: telegramId,
        ui_state: uiState,
        updated_at: nowIso(),
      });
      return this.get(telegramId);
    },

    resetUser(telegramId: number) {
      deleteUserStmt.run(telegramId);
    },

    resetAll() {
      deleteAllStmt.run();
    },
  };
}

