-- Sanitize corrupted assistant messages in wizard_sessions where the AI response
-- was truncated mid-<draft> tag, leaving raw JSON visible in the chat UI.
-- For each affected session, walk through messages and strip:
--   - well-formed <draft>...</draft> blocks
--   - orphan <draft> with no closer (truncated responses)
--   - stray ```json fences (well-formed and orphan)

DO $$
DECLARE
  rec RECORD;
  msg jsonb;
  cleaned jsonb;
  new_msgs jsonb := '[]'::jsonb;
  content_text text;
BEGIN
  FOR rec IN
    SELECT id, messages
    FROM wizard_sessions
    WHERE messages::text LIKE '%<draft>%' OR messages::text LIKE '%```json%'
  LOOP
    new_msgs := '[]'::jsonb;
    FOR msg IN SELECT * FROM jsonb_array_elements(rec.messages)
    LOOP
      IF msg->>'role' = 'assistant' THEN
        content_text := msg->>'content';
        -- Strip well-formed <draft>...</draft>
        content_text := regexp_replace(content_text, '<draft>[\s\S]*?</draft>', '', 'g');
        -- Strip orphan <draft> through end of string
        content_text := regexp_replace(content_text, '<draft>[\s\S]*$', '', 'g');
        -- Strip well-formed ```json ... ```
        content_text := regexp_replace(content_text, '```json[\s\S]*?```', '', 'g');
        -- Strip orphan ```json through end of string
        content_text := regexp_replace(content_text, '```json[\s\S]*$', '', 'g');
        content_text := btrim(content_text);
        cleaned := jsonb_set(msg, '{content}', to_jsonb(content_text));
        new_msgs := new_msgs || cleaned;
      ELSE
        new_msgs := new_msgs || msg;
      END IF;
    END LOOP;
    UPDATE wizard_sessions SET messages = new_msgs WHERE id = rec.id;
  END LOOP;
END $$;