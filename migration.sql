-- URUCHOM TO W ZAKŁADCE "SQL EDITOR" W SWOIM ZASOBIE SUPABASE:

-- 1. Dodanie kolumny user_id do tabeli documents (jeśli jeszcze nie istnieje)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Upewnienie się, że tabela conversations ma powiązanie klucza obcego do auth.users
-- (Jeśli klucz obcy już istnieje, to zapytanie nie zgłosi błędu lub upewni integralność)
ALTER TABLE conversations ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Czyszczenie starych danych niepowiązanych z żadnym użytkownikiem (sieroty)
DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id IS NULL);
DELETE FROM conversations WHERE user_id IS NULL;
DELETE FROM documents WHERE user_id IS NULL;

-- 4. Utworzenie tabeli briefings na poranne podsumowania (Lekcja 09)
CREATE TABLE IF NOT EXISTS briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  content text NOT NULL,
  date date NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Włączenie RLS dla tabeli briefings (dla bezpieczeństwa przed bezpośrednim anonimowym dostępem z zewnątrz)
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;

-- Polityka zezwalająca zalogowanym użytkownikom na odczyt tylko własnych podsumowań
CREATE POLICY "Users can read their own briefings" 
ON briefings 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- 5. Utworzenie tabeli webhook_events dla zewnętrznych powiadomień (Lekcja 09, Warsztat 3)
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  type text NOT NULL,
  data jsonb NOT NULL,
  analysis text NOT NULL
);

-- Włączenie RLS dla tabeli webhook_events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- 6. Utworzenie tabeli message_logs dla logowania i limitowania zapytań (Lekcja 10, Warsztat 2)
CREATE TABLE IF NOT EXISTS message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  message_length integer NOT NULL,
  blocked boolean DEFAULT false,
  message text,
  reason text
);

-- Włączenie RLS dla tabeli message_logs
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Polityka zezwalająca użytkownikom na odczyt własnych logów
CREATE POLICY "Users can read their own message logs"
ON message_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 7. Utworzenie tabeli api_usage do budżetowania kosztów (Lekcja 10, Warsztat 3)
CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  tokens_input integer NOT NULL,
  tokens_output integer NOT NULL,
  model text NOT NULL,
  endpoint text NOT NULL
);

-- Włączenie RLS dla tabeli api_usage
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Polityka zezwalająca użytkownikom na odczyt własnego zużycia
CREATE POLICY "Users can read their own api usage"
ON api_usage
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


