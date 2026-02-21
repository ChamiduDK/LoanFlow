import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health.routes";
import { authRouter } from "./routes/auth.routes";
import { profileRouter } from "./routes/profile.routes";
import { banksRouter } from "./routes/banks.routes";
import { adminRouter } from "./routes/admin.routes";
import { applicationsRouter } from "./routes/applications.routes";
import { documentsRouter } from "./routes/documents.routes";
import { outcomeRouter } from "./routes/outcome.routes";
import { trackerRouter } from "./routes/tracker.routes";
import { calculatorRouter } from "./routes/calculator.routes";
import { agentRouter } from "./routes/agent.routes";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    data: {
      service: "sme-loanhub-api",
      status: "ok",
      message: "Use /api/* endpoints. Try /api/health",
    },
  });
});

app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", profileRouter);
app.use("/api", banksRouter);
app.use("/api", adminRouter);
app.use("/api", applicationsRouter);
app.use("/api", documentsRouter);
app.use("/api", outcomeRouter);
app.use("/api", trackerRouter);
app.use("/api", calculatorRouter);
app.use("/api", agentRouter);

app.use(errorHandler);

export default app;
