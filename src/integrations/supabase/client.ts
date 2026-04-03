import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xiufgczyecwgnkbyroow.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2S9-xLvsc7EjbufkT0aIcg_o1NvLNLx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
