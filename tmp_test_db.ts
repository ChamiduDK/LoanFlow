import { supabaseAdmin } from "./server/lib/supabase/client";

async function testDB() {
  console.log("🚀 Testing Supabase connection...");

  const tables = [
    "profiles",
    "loan_applications",
    "installments",
    "banks",
    "loan_products",
    "chat_sessions",
    "chat_messages",
    "eligibility_rules",
    "required_documents",
    "benefits"
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await supabaseAdmin
        .from(table)
        .select("*", { count: 'exact', head: true });

      if (error) {
        console.error(`❌ Error querying [${table}]:`, error.message);
        if (error.details) console.error(`   Details: ${error.details}`);
        if (error.hint) console.error(`   Hint: ${error.hint}`);
      } else {
        console.log(`✅ Table [${table}] is accessible. Count: ${count}`);
      }
    } catch (e: any) {
      console.error(`💥 Fatal error querying [${table}]:`, e.message);
    }
  }

  console.log("\n🔍 Testing join query (loan_applications join profiles)...");
  try {
    const { data: joinData, error: joinError } = await supabaseAdmin
      .from("loan_applications")
      .select("*, profiles(full_name)")
      .limit(1);

    if (joinError) {
      console.error("❌ Join query failed:", joinError.message);
    } else {
      console.log("✅ Join query works.");
    }
  } catch (e: any) {
    console.error("💥 Fatal error in join query:", e.message);
  }
}

testDB().catch(err => {
  console.error("Final catch:", err);
  process.exit(1);
});
