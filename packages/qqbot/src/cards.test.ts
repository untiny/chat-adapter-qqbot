import { describe, expect, it } from "vitest";
import { decodeQQBotButtonData, encodeQQBotButtonData } from "./cards";

describe("QQBot button data", () => {
  it("round trips action id and value", () => {
    const encoded = encodeQQBotButtonData("approve", "__cb:0123456789abcdef");
    expect(decodeQQBotButtonData(encoded)).toEqual({
      actionId: "approve",
      value: "__cb:0123456789abcdef",
    });
  });
});
