-- chatbot_conversations.message_count only counted one of the two ways a
-- conversation happens.
--
-- The web widget maintained it by hand: read the old value, write old + 2
-- after each exchange. voice-concierge inserts the same messages into the same
-- table and never touched it, so every voice conversation reads as zero.
--
-- 24 of 49 conversations show message_count = 0. Seventeen of those have real
-- messages in them -- eighteen are voice, and eleven of those eighteen had a
-- conversation that simply was not counted. Anything reading that column,
-- including the owner's Chatbot tab and every "is the chat working" question,
-- has been under-reporting by about a third since voice was added.
--
-- A second hand-maintained increment in voice-concierge would work until the
-- next surface forgets it too. The messages are the truth; the counter should
-- follow them rather than be remembered alongside them.

create or replace function app_count_chatbot_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update chatbot_conversations
  set message_count = coalesce(message_count, 0) + 1,
      -- These were already kept up to date by the web path and the voice
      -- path separately. Doing it here means one writer, and it means a
      -- conversation is never newer than its own last message.
      last_message_at = new.created_at,
      last_message_role = new.role,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chatbot_messages_count on chatbot_messages;
create trigger chatbot_messages_count
after insert on chatbot_messages
for each row execute function app_count_chatbot_message();

-- Make the existing rows true. Counted from the messages themselves, so this
-- is the same answer the trigger would have given had it always been there.
update chatbot_conversations c
set message_count = m.n
from (
  select conversation_id, count(*) as n
  from chatbot_messages
  group by conversation_id
) m
where m.conversation_id = c.id
  and c.message_count is distinct from m.n;

-- A conversation with no messages at all is zero, not whatever was left there.
update chatbot_conversations c
set message_count = 0
where not exists (select 1 from chatbot_messages x where x.conversation_id = c.id)
  and coalesce(c.message_count, 0) <> 0;

revoke all on function app_count_chatbot_message() from public, anon, authenticated;
