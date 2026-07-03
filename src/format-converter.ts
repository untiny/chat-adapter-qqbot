import {
  markdownToPlainText,
  parseMarkdown,
  stringifyMarkdown,
  toPlainText,
  type AdapterPostableMessage,
  type CardElement,
  type FormattedContent,
  type Root,
} from "chat";
import { cardToFallbackText, extractCard } from "@chat-adapter/shared";

/** Converts between Chat SDK markdown/card content and QQBot text payloads. */
export class QQBotFormatConverter {
  /** Parse QQBot message text into Chat SDK's canonical markdown AST. */
  toAst(platformText: string): Root {
    return parseMarkdown(platformText || "");
  }

  /** Render Chat SDK's markdown AST into QQBot-compatible markdown text. */
  fromAst(ast: FormattedContent): string {
    return stringifyMarkdown(ast);
  }

  /** Strip markdown formatting to plain text. */
  toPlainText(markdown: string): string {
    return markdownToPlainText(markdown || "");
  }

  /** Render a Chat SDK card as readable fallback text for QQBot. */
  renderCard(card: CardElement): string {
    return cardToFallbackText(card, { boldFormat: "**", lineBreak: "\n" });
  }

  /** Render any Chat SDK postable message into the text portion of a QQBot payload. */
  renderPostable(message: AdapterPostableMessage): string {
    if (typeof message === "string") {
      return message;
    }

    const card = extractCard(message);
    if (card) {
      return this.renderCard(card);
    }

    if (typeof message === "object" && message && "markdown" in message) {
      return String(message.markdown ?? "");
    }

    if (typeof message === "object" && message && "text" in message) {
      return String(message.text ?? "");
    }

    if (typeof message === "object" && message && "ast" in message) {
      return this.fromAst(message.ast as FormattedContent);
    }

    if (typeof message === "object" && message && "formatted" in message) {
      return this.fromAst(message.formatted as FormattedContent);
    }

    if (typeof message === "object" && message && "raw" in message) {
      const raw = message.raw;
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    }

    return "";
  }

  /** Convert formatted content directly to plain text. */
  formattedToText(content: FormattedContent): string {
    return toPlainText(content);
  }
}
