import { validationError } from "./errors";

/** Separator used to pack Chat SDK action ID and value into QQBot button data. */
export const QQBOT_BUTTON_DATA_DELIMITER = "\n";
/** Conservative byte limit for QQBot button callback payloads. */
export const QQBOT_BUTTON_DATA_MAX_LENGTH = 1024;

/** Encode a Chat SDK button action ID and optional value for QQBot keyboards. */
export function encodeQQBotButtonData(
  actionId: string,
  value?: string,
): string {
  const encoded =
    value == null || value === ""
      ? actionId
      : `${actionId}${QQBOT_BUTTON_DATA_DELIMITER}${value}`;
  if (Buffer.byteLength(encoded, "utf8") > QQBOT_BUTTON_DATA_MAX_LENGTH) {
    throw validationError(
      `QQBot button data exceeds ${QQBOT_BUTTON_DATA_MAX_LENGTH} bytes.`,
    );
  }
  return encoded;
}

/** Decode QQBot keyboard data back into Chat SDK action ID and value fields. */
export function decodeQQBotButtonData(data: string): {
  actionId: string;
  value: string | undefined;
} {
  const idx = data.indexOf(QQBOT_BUTTON_DATA_DELIMITER);
  if (idx === -1) {
    return { actionId: data, value: undefined };
  }
  return {
    actionId: data.slice(0, idx),
    value: data.slice(idx + QQBOT_BUTTON_DATA_DELIMITER.length),
  };
}
