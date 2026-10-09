import { supabaseAdmin } from "./server/lib/supabase/client";

async function testSessionCreation() {
  console.log("Testing session creation...");

  // Get a test user
  const { data: profile } = await supabaseAdmin.from("profiles").select("id").limit(1).single();

  if (!profile) {
    console.error("No profile found for testing.");
    return;
  }

  console.log(`Using test user: ${profile.id}`);

  const { data, error } = await supabaseAdmin
    .from("chat_sessions")
    .insert({
      user_id: profile.id,
      status: "active",
      metadata: { channel: "test" }
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating session:", error);
  } else {
    console.log("Session created successfully:", data);
  }
}

testSessionCreation().catch(console.error);
