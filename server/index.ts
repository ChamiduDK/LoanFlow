import app from "./app";
import { env } from "./config/env";

app.listen(env.API_PORT, () => {
  console.log(`SME LoanHub API running on http://localhost:${env.API_PORT}`);
});
