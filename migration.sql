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
