-- Improve WhatsApp channel lookup performance for Twilio webhooks

create index if not exists idx_user_channel_links_channel_lookup
on public.user_channel_links (channel_type, channel_user_id);
