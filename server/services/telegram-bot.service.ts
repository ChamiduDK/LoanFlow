import { env } from "../config/env";
import { internalError } from "../lib/errors";
import { normalizeTelegramChatId } from "../lib/telegram";
import { processIncomingTelegramMessage, type TelegramMediaEntry } from "./telegram-channel.service";

type TelegramBotStatus = {
  enabled: boolean;
  state: "disabled" | "idle" | "starting" | "polling" | "error";
  lastError: string | null;
  botUsername: string | null;
  botId: number | null;
  lastUpdateId: number | null;
  lastReadyAt: string | null;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

type TelegramUser = {
  id: number;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramPhotoSize = {
  file_id: string;
};

type TelegramDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
};

type TelegramAudio = {
  file_id: string;
  mime_type?: string;
  file_name?: string;
};

type TelegramVoice = {
  file_id: string;
  mime_type?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  from?: TelegramUser;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  document?: TelegramDocument;
  photo?: TelegramPhotoSize[];
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramFile = {
  file_path?: string;
};

class TelegramBotService {
  private pollingPromise: Promise<void> | null = null;
  private stopRequested = false;
  private offset = 0;
  private status: TelegramBotStatus = {
    enabled: Boolean(env.TELEGRAM_BOT_TOKEN),
    state: env.TELEGRAM_BOT_TOKEN ? "idle" : "disabled",
    lastError: null,
    botUsername: null,
    botId: null,
    lastUpdateId: null,
    lastReadyAt: null,
  };

  getStatus(): TelegramBotStatus {
    return { ...this.status };
  }

  isEnabled(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN);
  }

  async initialize(): Promise<void> {
    if (!this.isEnabled()) {
      this.status = {
        ...this.status,
        enabled: false,
        state: "disabled",
        lastError: "TELEGRAM_BOT_TOKEN is not configured",
      };
      return;
    }

    if (this.pollingPromise) {
      return this.pollingPromise;
    }

    this.stopRequested = false;
    this.status = {
      ...this.status,
      enabled: true,
      state: "starting",
      lastError: null,
    };

    const me = await this.callApi<{ id: number; username?: string }>("getMe", {});
    this.status = {
      ...this.status,
      state: "polling",
      botUsername: me.username ?? env.TELEGRAM_BOT_USERNAME ?? null,
      botId: me.id,
      lastReadyAt: new Date().toISOString(),
      lastError: null,
    };

    console.log(`LoanFlow Telegram bot polling started${me.username ? ` as @${me.username}` : ""}.`);

    this.pollingPromise = this.pollLoop().finally(() => {
      this.pollingPromise = null;
    });
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        const updates = await this.callApi<TelegramUpdate[]>("getUpdates", {
          offset: this.offset,
          timeout: 25,
          allowed_updates: ["message"],
        });

        for (const update of updates) {
          this.offset = update.update_id + 1;
          this.status = {
            ...this.status,
            lastUpdateId: update.update_id,
          };
          await this.handleUpdate(update);
        }
      } catch (error) {
        this.status = {
          ...this.status,
          state: "error",
          lastError: error instanceof Error ? error.message : String(error),
        };
        console.error("LoanFlow Telegram polling failed", error);
        await new Promise((resolve) => setTimeout(resolve, env.TELEGRAM_POLL_INTERVAL_MS));
        this.status = {
          ...this.status,
          state: "polling",
        };
      }
    }
  }

  async sendReply(input: { chatId: string; text: string; mediaUrl?: string }): Promise<void> {
    const chatId = normalizeTelegramChatId(input.chatId);
    if (input.text.trim()) {
      await this.callApi("sendMessage", {
        chat_id: chatId,
        text: input.text,
      });
    }

    if (input.mediaUrl) {
      const media = await this.fetchRemoteMedia(input.mediaUrl);
      if (media.mimeType.startsWith("audio/")) {
        await this.sendMultipart("sendVoice", {
          chat_id: chatId,
          voice: new Blob([media.buffer], { type: media.mimeType }),
        }, media.fileName);
        return;
      }

      await this.sendMultipart("sendDocument", {
        chat_id: chatId,
        document: new Blob([media.buffer], { type: media.mimeType }),
      }, media.fileName);
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message) {
      return;
    }

    if (message.chat.type !== "private") {
      await this.sendReply({
        chatId: String(message.chat.id),
        text: "LoanFlow Telegram support currently works only in private chats.",
      });
      return;
    }

    const media = await this.extractMedia(message);
    const result = await processIncomingTelegramMessage({
      chatId: String(message.chat.id),
      text: message.text ?? message.caption ?? "",
      media,
      ipAddress: "telegram_polling",
      verificationChannel: "telegram_polling",
    });

    await this.sendReply({
      chatId: String(message.chat.id),
      text: result.replyText,
      mediaUrl: result.replyMediaUrl,
    });
  }

  private async extractMedia(message: TelegramMessage): Promise<TelegramMediaEntry | undefined> {
    if (message.voice?.file_id) {
      const downloaded = await this.downloadFile(message.voice.file_id);
      return {
        contentType: message.voice.mime_type ?? "audio/ogg",
        fileName: `voice-${message.message_id}.ogg`,
        buffer: downloaded,
      };
    }

    if (message.audio?.file_id) {
      const downloaded = await this.downloadFile(message.audio.file_id);
      return {
        contentType: message.audio.mime_type ?? "audio/mpeg",
        fileName: message.audio.file_name ?? `audio-${message.message_id}.mp3`,
        buffer: downloaded,
      };
    }

    if (message.document?.file_id) {
      const downloaded = await this.downloadFile(message.document.file_id);
      return {
        contentType: message.document.mime_type ?? "application/octet-stream",
        fileName: message.document.file_name ?? `document-${message.message_id}`,
        buffer: downloaded,
      };
    }

    if (Array.isArray(message.photo) && message.photo.length > 0) {
      const photo = message.photo[message.photo.length - 1];
      const downloaded = await this.downloadFile(photo.file_id);
      return {
        contentType: "image/jpeg",
        fileName: `photo-${message.message_id}.jpg`,
        buffer: downloaded,
      };
    }

    return undefined;
  }

  private async downloadFile(fileId: string): Promise<Buffer> {
    const file = await this.callApi<TelegramFile>("getFile", { file_id: fileId });
    if (!file.file_path) {
      throw internalError("Telegram did not return a file path");
    }

    const response = await fetch(`${this.fileBaseUrl}/${file.file_path}`);
    if (!response.ok) {
      throw internalError("Failed to download Telegram media", {
        status: response.status,
        file_path: file.file_path,
      });
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async fetchRemoteMedia(url: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw internalError("Failed to fetch Telegram reply media", {
        status: response.status,
        url,
      });
    }

    const mimeType = String(response.headers.get("content-type") ?? "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const fileName = new URL(url).pathname.split("/").filter(Boolean).pop() ?? `telegram-media-${Date.now()}`;

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType,
      fileName,
    };
  }

  private async sendMultipart(
    method: "sendVoice" | "sendDocument",
    fields: Record<string, string | Blob>,
    fileName: string,
  ): Promise<void> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value instanceof Blob) {
        form.append(key, value, fileName);
      } else {
        form.append(key, value);
      }
    }

    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw internalError(`Telegram ${method} failed`, {
        status: response.status,
        body,
      });
    }

    const payload = (await response.json()) as TelegramApiResponse<unknown>;
    if (!payload.ok) {
      throw internalError(`Telegram ${method} was rejected`, payload);
    }
  }

  private async callApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw internalError(`Telegram ${method} request failed`, {
        status: response.status,
        body,
      });
    }

    const data = (await response.json()) as TelegramApiResponse<T>;
    if (!data.ok || data.result === undefined) {
      throw internalError(`Telegram ${method} returned an error`, data);
    }

    return data.result;
  }

  private get baseUrl(): string {
    return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  private get fileBaseUrl(): string {
    return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}`;
  }
}

export const telegramBotService = new TelegramBotService();
