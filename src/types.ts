export type Step =
  | "welcome"
  | "subscribe_gate"
  | "lesson_1"
  | "lesson_2"
  | "lesson_3"
  | "done";

export type UserRow = {
  telegram_id: number;
  step: Step;
  subscribed: 0 | 1;
  lesson: 0 | 1 | 2 | 3;
  ui_state: string | null;
  created_at: string;
  updated_at: string;
};

