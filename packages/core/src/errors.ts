/** Business errors. The code doubles as the translation key on screen (errors.<code>). */
export const ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'not_found',
  'invalid_input',
  'invalid_login',
  'too_many_attempts',
  'invalid_serial',
  'unit_scrapped',
  'unit_in_repair',
  'own_repair',
  'model_required',
  'unknown_model_code',
  'unknown_color_code',
  'defect_required',
  'invalid_transition',
  'not_assigned',
  'no_repair_action',
  'already_claimed',
  'duplicate',
  'not_enough_stock',
  'photo_too_large',
  'wrong_pin',
  'weak_pin',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(code);
  }
}
