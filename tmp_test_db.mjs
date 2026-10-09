import { supabaseAdmin } from "./server/lib/supabase/client";

async function testDB() {
  console.log("Testing Supabase connection...");
  
  const tables = [
    "profiles",
    "loan_applications",
    "installments",
    "banks",
    "loan_products",
    "chat_sessions",
    "chat_messages"
  ];

  for (const table of tables) {
    console.log(`\nTesting table: ${table}`);
    const { data, error, count } = await supabaseAdmin
      .from(table)
      .select("*", { count: 'exact', head: true });
    
    if (error) {
      console.error(`❌ Error querying ${table}:`, error.message, error.details);
    } else {
      console.log(`✅ Table ${table} is accessible. Count: ${count}`);
    }
  }

  // Double check profiles for a specific user if possible
  console.log("\nTesting dynamic query (loan_applications join profiles)...");
  const { data: joinData, error: joinError } = await supabaseAdmin
    .from("loan_applications")
    .select("*, profiles(full_name)")
    .limit(1);
    
  if (joinError) {
    console.error("❌ Join query failed:", joinError.message, joinError.details);
  } else {
    console.log("✅ Join query works.");
  }
}

testDB().catch(console.error);
