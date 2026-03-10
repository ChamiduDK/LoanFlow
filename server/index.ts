import app from "./app";
import { env } from "./config/env";
import { telegramBotService } from "./services/telegram-bot.service";

app.listen(env.API_PORT, () => {
  console.log(`LoanFlow API running on http://localhost:${env.API_PORT}`);

  if (env.WHATSAPP_PROVIDER === "whatsapp_web" && env.WHATSAPP_WEB_AUTO_START) {
    void import("./services/whatsapp-web.service")
      .then(({ whatsappWebService }) => whatsappWebService.initialize())
      .catch((error) => {
        console.error("Failed to initialize LoanFlow WhatsApp Web client", error);
      });
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_AUTO_START) {
    void telegramBotService.initialize().catch((error) => {
      console.error("Failed to initialize LoanFlow Telegram bot", error);
    });
  }
});
