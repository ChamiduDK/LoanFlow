import path from "node:path";
import qrcodeTerminal from "qrcode-terminal";
import { Client, LocalAuth, MessageMedia, type Message } from "whatsapp-web.js";
import { env } from "../config/env";
import { internalError } from "../lib/errors";
import { phoneFromWhatsAppChatId, toWhatsAppChatId } from "../lib/whatsapp";
import { processDirectWhatsAppMessage, type WhatsAppMediaEntry } from "./whatsapp-channel.service";
import type { OutboundWhatsAppMessage } from "./whatsapp-messaging.service";

type WhatsAppWebLifecycleState =
  | "disabled"
  | "idle"
  | "initializing"
  | "qr"
  | "authenticated"
  | "ready"
  | "auth_failure"
  | "disconnected"
  | "error";

type WhatsAppWebStatus = {
  enabled: boolean;
  state: WhatsAppWebLifecycleState;
  lastError: string | null;
  lastQr: string | null;
  sessionPath: string;
  currentWid: string | null;
  lastReadyAt: string | null;
};

function parseMimeType(value: string | undefined): string {
  return String(value ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/mp4" || mimeType === "audio/aac") return "m4a";
  return "bin";
}

function fileNameFromUrl(url: string, extension: string): string {
  try {
    const parsed = new URL(url);
    const base = parsed.pathname.split("/").filter(Boolean).pop();
    if (base) {
      return base;
    }
  } catch {
    // Fall back to a generated filename for signed or invalid URLs.
  }

  return `whatsapp-media-${Date.now()}.${extension}`;
}

class WhatsAppWebService {
  private client: Client | null = null;
  private initializationPromise: Promise<void> | null = null;
  private status: WhatsAppWebStatus = {
    enabled: env.WHATSAPP_PROVIDER === "whatsapp_web",
    state: env.WHATSAPP_PROVIDER === "whatsapp_web" ? "idle" : "disabled",
    lastError: null,
    lastQr: null,
    sessionPath: path.resolve(process.cwd(), env.WHATSAPP_WEB_SESSION_DIR),
    currentWid: null,
    lastReadyAt: null,
  };

  getStatus(): WhatsAppWebStatus {
    return { ...this.status };
  }

  isEnabled(): boolean {
    return env.WHATSAPP_PROVIDER === "whatsapp_web";
  }

  async initialize(): Promise<void> {
    if (!this.isEnabled()) {
      this.status = {
        ...this.status,
        enabled: false,
        state: "disabled",
        lastError: "WHATSAPP_PROVIDER is not set to whatsapp_web",
      };
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    if (this.client && this.status.state === "ready") {
      return;
    }

    this.status = {
      ...this.status,
      enabled: true,
      state: "initializing",
      lastError: null,
    };

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: env.WHATSAPP_WEB_CLIENT_ID,
        dataPath: this.status.sessionPath,
      }),
      puppeteer: {
        headless: env.WHATSAPP_WEB_HEADLESS,
        executablePath: env.WHATSAPP_WEB_EXECUTABLE_PATH,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
      qrMaxRetries: 0,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0,
      authTimeoutMs: 0,
    });

    this.client = client;
    this.attachEventHandlers(client);

    this.initializationPromise = client
      .initialize()
      .catch((error) => {
        this.status = {
          ...this.status,
          state: "error",
          lastError: error instanceof Error ? error.message : String(error),
        };
        this.client = null;
        throw error;
      })
      .finally(() => {
        this.initializationPromise = null;
      });

    await this.initializationPromise;
  }

  async sendMessage(input: OutboundWhatsAppMessage): Promise<void> {
    const client = await this.requireReadyClient();
    const chatId = await this.resolveChatId(client, input.to);

    if (input.body.trim()) {
      await client.sendMessage(chatId, input.body);
    }

    if (input.mediaUrl) {
      const media = await this.loadMediaFromUrl(input.mediaUrl);
      const isAudio = media.mimetype.startsWith("audio/");
      await client.sendMessage(chatId, media, isAudio ? { sendAudioAsVoice: true } : {});
    }
  }

  private attachEventHandlers(client: Client): void {
    client.on("qr", (qr: string) => {
      this.status = {
        ...this.status,
        state: "qr",
        lastQr: qr,
        lastError: null,
      };

      if (env.WHATSAPP_WEB_LOG_QR) {
        console.log("LoanFlow WhatsApp Web QR received. Scan it with WhatsApp on the linked device.");
        qrcodeTerminal.generate(qr, { small: true });
      }
    });

    client.on("authenticated", () => {
      this.status = {
        ...this.status,
        state: "authenticated",
        lastError: null,
      };
    });

    client.on("ready", () => {
      this.status = {
        ...this.status,
        state: "ready",
        lastQr: null,
        lastError: null,
        currentWid: client.info?.wid?._serialized ?? null,
        lastReadyAt: new Date().toISOString(),
      };
      console.log("LoanFlow WhatsApp Web client is ready.");
    });

    client.on("auth_failure", (message: string) => {
      this.status = {
        ...this.status,
        state: "auth_failure",
        lastError: message || "Authentication failed",
      };
      console.error("LoanFlow WhatsApp Web authentication failed", message);
    });

    client.on("disconnected", (reason: string) => {
      this.status = {
        ...this.status,
        state: "disconnected",
        currentWid: null,
        lastError: reason || null,
      };
      this.client = null;
      console.warn("LoanFlow WhatsApp Web client disconnected", reason);
    });

    client.on("message", (message: Message) => {
      void this.handleIncomingMessage(message);
    });
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    if (message.fromMe || !message.from.endsWith("@c.us")) {
      return;
    }

    try {
      const mediaEntries = await this.extractMediaEntries(message);
      const result = await processDirectWhatsAppMessage({
        from: phoneFromWhatsAppChatId(message.from),
        body: String(message.body ?? "").trim(),
        mediaEntries,
        ipAddress: "whatsapp_web",
        verificationChannel: "whatsapp_web",
      });

      await this.sendMessage({
        to: message.from,
        body: result.replyText,
        mediaUrl: result.replyMediaUrl,
      });
    } catch (error) {
      console.error("LoanFlow WhatsApp Web message processing failed", error);

      try {
        await this.sendMessage({
          to: message.from,
          body: "I could not process that WhatsApp message right now. Please try again in a moment.",
        });
      } catch (sendError) {
        console.error("LoanFlow WhatsApp Web fallback reply failed", sendError);
      }
    }
  }

  private async extractMediaEntries(message: Message): Promise<WhatsAppMediaEntry[]> {
    if (!message.hasMedia) {
      return [];
    }

    const media = await message.downloadMedia();
    if (!media) {
      return [];
    }

    const mimeType = parseMimeType(media.mimetype);
    const fileName = media.filename ?? `incoming-${Date.now()}.${extensionFromMime(mimeType)}`;

    return [
      {
        mediaUrl: "",
        contentType: mimeType,
        localFile: {
          buffer: Buffer.from(media.data, "base64"),
          fileName,
          mimeType,
        },
      },
    ];
  }

  private async loadMediaFromUrl(url: string): Promise<MessageMedia> {
    const response = await fetch(url);
    if (!response.ok) {
      throw internalError("Failed to fetch outbound WhatsApp media", {
        status: response.status,
        url,
      });
    }

    const mimeType = parseMimeType(response.headers.get("content-type") ?? undefined);
    const extension = extensionFromMime(mimeType);
    const fileName = fileNameFromUrl(url, extension);
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");

    return new MessageMedia(mimeType, data, fileName);
  }

  private async requireReadyClient(): Promise<Client> {
    if (!this.client || this.status.state !== "ready") {
      await this.initialize();
    }

    if (!this.client || this.status.state !== "ready") {
      throw internalError("WhatsApp Web client is not ready");
    }

    return this.client;
  }

  private async resolveChatId(client: Client, value: string): Promise<string> {
    if (value.endsWith("@c.us")) {
      return value;
    }

    const normalized = phoneFromWhatsAppChatId(value);
    const lookup = await client.getNumberId(normalized);
    return lookup?._serialized ?? toWhatsAppChatId(normalized);
  }
}

export const whatsappWebService = new WhatsAppWebService();
